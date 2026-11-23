import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { GivingPage } from "./GivingPage";

afterEach(cleanup);

// Synthetic data only. The demo's regular gifts are for Sep to Nov 2026 ($150.00, $200.00 and $150.00), and its two special
// contributions are $250.00 (Sep 14, 2026) and $100.00 (Mar 29, 2026).
function open(api: Api = createDemoApi(), today = "2026-11-18") {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <GivingPage today={today} />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
const month = (name: string) => screen.findByRole("listitem", { name });

describe("Giving screen", () => {
  it("[AC-GIV-03.1] groups regular giving by the month it is for, newest first, and sums several gifts in a month", async () => {
    open();
    const october = await month("October 2026");
    expect(within(october).getByText("$200.00")).toBeTruthy(); // $150.00 + $50.00
    expect(within(october).getAllByText(/Oct (5|28), 2026/)).toHaveLength(2);
    const names = within(screen.getByRole("region", { name: "Regular giving by month" })).getAllByRole("listitem").filter((li) => li.getAttribute("aria-label")).map((li) => li.getAttribute("aria-label"));
    expect(names.slice(0, 3)).toEqual(["November 2026", "October 2026", "September 2026"]);
  });

  it("[AC-GIV-03.1] a gift given in one month is listed under the month it is for, with its description", async () => {
    open();
    const september = await month("September 2026");
    expect(within(september).getAllByText("$150.00")).toHaveLength(2); // the month total and the one gift
    expect(within(september).getByText("Oct 3, 2026, September tithe")).toBeTruthy(); // given in October, for September
  });

  it("[AC-GIV-03.2] shows year-to-date totals for regular, special and combined giving", async () => {
    open();
    const totals = await screen.findByRole("region", { name: "Year to date" });
    expect(within(totals).getByText("Regular giving").nextSibling?.textContent).toBe("$500.00");
    expect(within(totals).getByText("Special contributions").nextSibling?.textContent).toBe("$350.00");
    expect(within(totals).getByText("Combined").nextSibling?.textContent).toBe("$850.00");
  });

  it("[AC-GIV-03.2] another year shows that year's total, with special contributions counted by the date given", async () => {
    const api = createDemoApi();
    await api.logGift({ dateGiven: "2025-12-03", forMonth: "2025-12", cents: 20_000, method: "check" });
    open(api);
    await screen.findByRole("region", { name: "Year to date" });
    await userEvent.selectOptions(screen.getByLabelText("Year"), "2025");
    const totals = await screen.findByRole("region", { name: "Total for 2025" });
    expect(within(totals).getByText("Regular giving").nextSibling?.textContent).toBe("$200.00");
    expect(within(totals).getByText("Special contributions").nextSibling?.textContent).toBe("$0.00");
    expect(within(totals).getByText("Combined").nextSibling?.textContent).toBe("$200.00");
  });

  it("[AC-GIV-03.3] clearly marks a month with no regular gift as 'No gift', and not a month that has a gift", async () => {
    const api = createDemoApi();
    for (const id of [2, 3]) await api.deleteGift(id); // takes October's gifts away
    open(api);
    expect(within(await month("October 2026")).getByText("No gift")).toBeTruthy();
    expect(within(await month("November 2026")).queryByText("No gift")).toBeNull();
    expect(within(await month("September 2026")).queryByText("No gift")).toBeNull();
  });

  it("[AC-GIV-03.3] marks the current month as 'No gift' until a gift is recorded for it, and shows no future months", async () => {
    open(createDemoApi(), "2026-12-10");
    expect(within(await month("December 2026")).getByText("No gift")).toBeTruthy();
    expect(screen.queryByRole("listitem", { name: "January 2027" })).toBeNull();
  });

  it("[AC-GIV-03.3] does not flag months before the first regular gift ever recorded", async () => {
    open();
    await month("September 2026");
    expect(screen.queryByRole("listitem", { name: "August 2026" })).toBeTruthy(); // listed for the year, but not flagged
    expect(within(screen.getByRole("listitem", { name: "August 2026" })).queryByText("No gift")).toBeNull();
  });

  it("[AC-GIV-03.2] says what to do next when nothing is recorded yet", async () => {
    const api = createDemoApi();
    for (const g of (await api.listGifts()).gifts) await api.deleteGift(g.id);
    for (const c of (await api.listSpecialContributions()).contributions) await api.deleteSpecialContribution(c.id);
    open(api);
    expect(await screen.findByText(/No giving recorded yet\. Log a gift/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Year to date" })).toBeNull();
  });

  it("[AC-GIV-03.2] shows a message when the numbers cannot be loaded, and keeps the links", async () => {
    const api = createDemoApi();
    api.listGifts = async () => {
      throw new Error("down");
    };
    open(api);
    expect((await screen.findByRole("alert")).textContent).toContain("did not work");
    expect(screen.getByRole("link", { name: "Log a gift" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Special contributions" })).toBeTruthy();
  });

  it("[AC-GIV-03.1] keeps the links to log a gift and to special contributions", async () => {
    open();
    await screen.findByRole("region", { name: "Year to date" });
    expect(screen.getByRole("link", { name: "Log a gift" }).getAttribute("href")).toBe("/giving/log");
    expect(screen.getByRole("link", { name: "Special contributions" }).getAttribute("href")).toBe("/giving/special");
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  });
});

describe("Giving chart (GIV-04)", () => {
  it("[AC-GIV-04.1][AC-GIV-04.2][AC-GIV-04.3] shows the year's giving by month, with special apart, the year total and the monthly average", async () => {
    open();
    const chart = await screen.findByRole("region", { name: "Giving by month" });
    expect(within(chart).getByRole("img").getAttribute("aria-label")).toContain("regular giving and special contributions stacked");
    expect(within(chart).getAllByText("$850.00").length).toBeGreaterThan(0); // 500.00 regular + 350.00 special
    expect(within(chart).getByText("$77.27")).toBeTruthy(); // 85,000 cents over the 11 months so far, to the cent
    expect(within(chart).getByText(/Special \(left scale\)/)).toBeTruthy();
  });

  it("[AC-GIV-04.5] has a text table of every month with regular, special and the running total", async () => {
    open();
    const chart = await screen.findByRole("region", { name: "Giving by month" });
    const table = within(chart).getByRole("table", { name: "Giving by month in 2026" });
    expect(within(table).getAllByRole("row")).toHaveLength(13); // heading plus twelve months
    const september = within(table).getByRole("row", { name: /September 2026/ });
    expect(within(september).getAllByRole("cell").map((c) => c.textContent)).toEqual(["$150.00", "$250.00", "$500.00"]); // running: 100.00 in March + 150.00 + 250.00
  });

  it("[AC-GIV-04.4] switching to another year with gifts shows that year's chart", async () => {
    const api = createDemoApi();
    await api.logGift({ dateGiven: "2025-12-03", forMonth: "2025-12", cents: 20_000, method: "check" });
    open(api);
    await screen.findByRole("region", { name: "Giving by month" });
    await userEvent.selectOptions(screen.getByLabelText("Year"), "2025");
    expect(await screen.findByRole("table", { name: "Giving by month in 2025" })).toBeTruthy();
  });

  it("[AC-GIV-04.4] a year with no gifts says so instead of drawing an empty chart", async () => {
    open(createDemoApi(), "2027-02-10");
    await screen.findByRole("region", { name: "Giving by month" });
    await userEvent.selectOptions(screen.getByLabelText("Year"), "2027");
    expect(screen.getByText("No giving recorded for 2027.")).toBeTruthy();
    expect(screen.queryByRole("table", { name: /Giving by month/ })).toBeNull();
  });
});
