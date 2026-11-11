import { describe, expect, it } from "vitest";
import { centsToInput, dateLabel, formatCents, monthLabel, parseDollars, todayLocal } from "./giftFormat";

describe("parseDollars", () => {
  it("[AC-GIV-01.1] turns typed dollars into whole cents without floating point", () => {
    expect(parseDollars("150")).toBe(15_000);
    expect(parseDollars("150.5")).toBe(15_050);
    expect(parseDollars("$1,250.07")).toBe(125_007);
    expect(parseDollars("0.29")).toBe(29);
    expect(parseDollars("19.99")).toBe(1_999);
  });

  it("[AC-GIV-01.1] rejects empty, zero, negative, too precise and too large amounts", () => {
    for (const bad of ["", "0", "0.00", "-5", "1.234", "abc", "1.2.3", "10000001"]) expect(parseDollars(bad)).toBeUndefined();
  });

  it("[AC-GIV-01.4] the text shown when editing parses back to the same cents", () => {
    for (const cents of [1, 29, 1_999, 15_000, 125_007]) expect(parseDollars(centsToInput(cents))).toBe(cents);
  });
});

describe("labels", () => {
  it("[AC-GIV-01.2] shows the month it is for and the date given separately", () => {
    expect(monthLabel("2026-01")).toBe("January 2026");
    expect(dateLabel("2026-02-03")).toBe("Feb 3, 2026");
    expect(formatCents(15_000)).toBe("$150.00");
    expect(formatCents(125_007)).toBe("$1,250.07");
  });

  it("[AC-GIV-01.1] the default date given is today's local calendar date", () => {
    expect(todayLocal(new Date(2026, 10, 13, 23, 59))).toBe("2026-11-13");
  });
});
