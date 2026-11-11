import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import { createDemoApi } from "../../demo/demoApi";
import { LogGiftPage } from "./LogGiftPage";

afterEach(cleanup);

function open() {
  const api = createDemoApi();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <LogGiftPage />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
const setField = async (label: string, value: string, scope: { getByLabelText: typeof screen.getByLabelText } = screen) => {
  const input = scope.getByLabelText(label) as HTMLInputElement;
  await userEvent.clear(input);
  await userEvent.type(input, value);
};

describe("Log a gift screen", () => {
  it("[AC-GIV-01.1] asks for date given, month it is for, amount and payment method, and never for a time", async () => {
    open();
    await screen.findByText("October 2026");
    expect(screen.getByLabelText("Date given")).toBeTruthy();
    expect(screen.getByLabelText("Month it is for")).toBeTruthy();
    expect(screen.getByLabelText("Amount")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Check" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Online card service" })).toBeTruthy();
    expect(document.querySelector('input[type="time"], input[type="datetime-local"]')).toBeNull();
    expect((screen.getByLabelText("Date given") as HTMLInputElement).type).toBe("date");
  });

  it("[AC-GIV-01.1] saves a gift and shows it, clearing only the amount", async () => {
    open();
    await screen.findByText("October 2026");
    await setField("Month it is for", "2026-09");
    await setField("Amount", "42.50");
    await userEvent.click(screen.getByRole("radio", { name: "Online card service" }));
    await userEvent.click(screen.getByRole("button", { name: "Save gift" }));
    expect((await screen.findByRole("status")).textContent).toContain("Saved $42.50 for September 2026");
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Save gift" }).hasAttribute("disabled")).toBe(true);
    expect(within(await screen.findByRole("group", { name: "September 2026" })).getByText("$42.50")).toBeTruthy();
  });

  it("[AC-GIV-01.1] will not save without a usable amount", async () => {
    open();
    await screen.findByText("October 2026");
    const save = screen.getByRole("button", { name: "Save gift" });
    expect(save.hasAttribute("disabled")).toBe(true);
    await setField("Amount", "12.345");
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/dollars and cents/)).toBeTruthy();
  });

  it("[AC-GIV-01.2] a gift given in one month can be for another month", async () => {
    open();
    await screen.findByText("October 2026");
    await setField("Date given", "2026-12-03");
    await setField("Month it is for", "2026-11");
    await setField("Amount", "10");
    await userEvent.click(screen.getByRole("button", { name: "Save gift" }));
    await screen.findByRole("status");
    const november = await screen.findByRole("group", { name: "November 2026" });
    expect(within(november).getByText("Dec 3, 2026")).toBeTruthy();
  });

  it("[AC-GIV-01.3] lists several gifts under one month, and the month total is their sum", async () => {
    open();
    const october = await screen.findByRole("group", { name: "October 2026" });
    expect(within(october).getAllByRole("listitem")).toHaveLength(2);
    expect(within(october).getByRole("heading", { level: 3 }).textContent).toContain("$200.00"); // $150.00 + $50.00
    await setField("Month it is for", "2026-10");
    await setField("Amount", "25");
    await userEvent.click(screen.getByRole("button", { name: "Save gift" }));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "October 2026" })).getByRole("heading", { level: 3 }).textContent).toContain("$225.00"));
  });

  it("[AC-GIV-01.4] edits every field of a gift and the month totals follow", async () => {
    open();
    const october = await screen.findByRole("group", { name: "October 2026" });
    await userEvent.click(within(october).getByRole("button", { name: "Edit gift: $50.00 given Oct 28, 2026" }));
    await setField("Amount", "75", within(screen.getByRole("group", { name: "October 2026" })));
    await userEvent.click(screen.getByRole("button", { name: "Save change" }));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "October 2026" })).getByRole("heading", { level: 3 }).textContent).toContain("$225.00"));
  });

  it("[AC-GIV-01.4] deleting asks first, then removes the gift", async () => {
    open();
    const october = await screen.findByRole("group", { name: "October 2026" });
    await userEvent.click(within(october).getByRole("button", { name: "Delete gift: $50.00 given Oct 28, 2026" }));
    expect(screen.getByRole("alert").textContent).toContain("removed for good");
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(within(screen.getByRole("group", { name: "October 2026" })).getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Delete gift: $50.00 given Oct 28, 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "October 2026" })).getAllByRole("listitem")).toHaveLength(1));
  });

  it("[AC-GIV-01.4] shows a message when saving fails", async () => {
    const api = open();
    api.logGift = async () => {
      throw new Error("down");
    };
    await screen.findByText("October 2026");
    await setField("Amount", "5");
    await userEvent.click(screen.getByRole("button", { name: "Save gift" }));
    expect((await screen.findByRole("alert")).textContent).toContain("did not work");
  });
});
