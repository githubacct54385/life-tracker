import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.x contrast of the design tokens in index.css, read from the real file so a change to a colour is checked (AC-SET-02.1).
const css = readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");

function tokens(selectorStart: string): Record<string, string> {
  const start = css.indexOf(selectorStart);
  const block = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([a-z0-9]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]));
}

// The dark block under the media query is the one used when the system asks for dark and the owner has not chosen.
const themes = {
  light: tokens(":root {"),
  "dark (system)": tokens(":root:not([data-theme=\"light\"])"),
  "dark (chosen)": tokens(":root[data-theme=\"dark\"]"),
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe.each(Object.entries(themes))("contrast in the %s theme", (_name, t) => {
  const surfaces = ["bg", "card", "sunk"] as const;

  it("[AC-SET-02.1] reads every token it needs", () => {
    for (const key of ["bg", "card", "sunk", "ink", "muted", "g700", "g100", "g900", "gtext"]) expect(t[key], key).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(surfaces)("[AC-SET-02.1] body, muted and green text meet WCAG AA (4.5:1) on %s", (surface) => {
    for (const text of ["ink", "muted", "gtext"] as const) expect(ratio(t[text]!, t[surface]!), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });

  it("[AC-SET-02.1] green text and the heading green are readable on the pale green panel", () => {
    expect(ratio(t.gtext!, t.g100!)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.g900!, t.g100!)).toBeGreaterThanOrEqual(4.5);
  });

  it("[AC-SET-02.1] white text on a green button meets WCAG AA", () => {
    expect(ratio("#ffffff", t.g700!)).toBeGreaterThanOrEqual(4.5);
  });

  it("[AC-SET-02.1] chart marks and the focus ring stand out from the card (3:1)", () => {
    expect(ratio(t.g700!, t.card!)).toBeGreaterThanOrEqual(3);
    expect(ratio(t.gtext!, t.card!)).toBeGreaterThanOrEqual(3);
    expect(ratio(t.gtext!, t.bg!)).toBeGreaterThanOrEqual(3);
  });
});
