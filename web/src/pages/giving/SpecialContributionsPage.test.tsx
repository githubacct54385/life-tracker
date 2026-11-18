import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import { createDemoApi } from "../../demo/demoApi";
import { SpecialContributionsPage } from "./SpecialContributionsPage";

afterEach(cleanup);

function open() {
  const api = createDemoApi();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <SpecialContributionsPage />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
const setField = async (label: string, value: string) => {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  await userEvent.clear(input);
  await userEvent.type(input, value);
};

describe("Special contributions screen", () => {
  it("[AC-GIV-02.1] asks for a name or occasion and never for a month it is for", async () => {
    open();
    await screen.findByText("Building fund appeal");
    expect(screen.getByLabelText("Name or occasion")).toBeTruthy();
    expect(screen.queryByLabelText("Month it is for")).toBeNull();
  });

  it("[AC-GIV-02.1] saves a contribution with its occasion, and will not save without one", async () => {
    open();
    await screen.findByText("Building fund appeal");
    await setField("Amount", "60.00");
    expect(screen.getByRole("button", { name: "Save special contribution" }).hasAttribute("disabled")).toBe(true);
    await setField("Name or occasion", "Harvest offering");
    await userEvent.click(screen.getByRole("button", { name: "Save special contribution" }));
    expect((await screen.findByRole("status")).textContent).toContain("Saved $60.00 for Harvest offering");
    expect(await screen.findByText("Harvest offering", { selector: "b" })).toBeTruthy();
  });

  it("[AC-GIV-02.2] lists the contributions with their own total", async () => {
    open();
    await screen.findByText("Building fund appeal");
    const section = screen.getByRole("region", { name: /Special contributions/ });
    expect(within(section).getByLabelText("Special contributions total").textContent).toBe("$350.00");
  });

  it("[AC-GIV-02.2] says what to do next when there are none", async () => {
    const api = open();
    await screen.findByText("Building fund appeal");
    for (const c of (await api.listSpecialContributions()).contributions) await api.deleteSpecialContribution(c.id);
    cleanup();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <SpecialContributionsPage />
        </ApiProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/No special contributions yet\. Add one/)).toBeTruthy();
  });

  it("[AC-GIV-02.1] edits the occasion of a contribution", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: /Edit special contribution: Spring offering/ }));
    const item = screen.getByRole("button", { name: "Save change" }).closest("li")!;
    const occasion = within(item).getByLabelText("Name or occasion") as HTMLInputElement;
    await userEvent.clear(occasion);
    await userEvent.type(occasion, "Easter offering");
    await userEvent.click(within(item).getByRole("button", { name: "Save change" }));
    expect(await screen.findByText("Easter offering", { selector: "b" })).toBeTruthy();
    expect(screen.queryByText("Spring offering")).toBeNull();
  });

  it("[AC-GIV-02.1] deletes a contribution only after confirming", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: /Delete special contribution: Spring offering/ }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await screen.findByText("Building fund appeal");
    expect(screen.queryByText("Spring offering")).toBeNull();
  });
});
