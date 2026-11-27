import { describe, expect, it } from "vitest";
import { keepOutOfTabOrder } from "./chartTabStops";

function chart() {
  const holder = document.createElement("div");
  holder.innerHTML = '<div class="recharts-wrapper"><svg><g class="layer"><line /></g><g tabindex="0" class="own"></g></svg></div>';
  return holder;
}
const tabindexes = (holder: HTMLElement) => [...holder.querySelectorAll("svg, svg *")].map((n) => n.getAttribute("tabindex"));

describe("keeping chart layers out of the tab order", () => {
  it("[AC-SET-02.2] marks every drawing layer so Tab skips it, and leaves one that already says what it is", () => {
    const holder = chart();
    keepOutOfTabOrder(holder);
    expect(tabindexes(holder)).toEqual(["-1", "-1", "-1", "0"]);
  });

  it("[AC-SET-02.2] keeps marking layers the chart draws later, and stops when it is taken off the page", async () => {
    const holder = chart();
    const stop = keepOutOfTabOrder(holder) as () => void;
    holder.querySelector("svg")!.append(document.createElementNS("http://www.w3.org/2000/svg", "g"));
    await Promise.resolve();
    expect(tabindexes(holder).at(-1)).toBe("-1");
    stop();
    holder.querySelector("svg")!.append(document.createElementNS("http://www.w3.org/2000/svg", "g"));
    await Promise.resolve();
    expect(tabindexes(holder).at(-1)).toBeNull();
  });

  it("[AC-SET-02.2] does nothing without an element", () => {
    expect(keepOutOfTabOrder(null)).toBeUndefined();
  });
});
