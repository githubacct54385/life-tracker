import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { ImportMileagePage } from "./ImportMileagePage";

afterEach(cleanup);

// Invented values. The "sheet" says 99 for the second week, but the readings give 30.
const CSV = "Date,Start Miles (Friday),Miles Driven\n2026-01-02,1000,120\n2026-01-09,1120,99\n2026-01-16,1150,\nbad,1,\n";
const file = (content = CSV, name = "history.csv") => new File([content], name, { type: "text/csv" });

function open(api: Api = createDemoApi()) {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <ImportMileagePage />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
const choose = (f: File) => userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText("Spreadsheet file"), f);

describe("Import history screen", () => {
  it("[AC-MIL-04.1][AC-MIL-04.2][AC-MIL-04.3] previews the rows with recalculated miles and flags a row that differs from the sheet", async () => {
    open();
    await choose(file());
    expect(await screen.findByText(/3 readings found/)).toBeTruthy();
    const flagged = document.querySelectorAll("tr[data-flagged]");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.textContent).toContain("Jan 9");
    expect(flagged[0]!.textContent).toContain("30");
    expect(flagged[0]!.textContent).toContain("sheet says 99");
    expect(screen.getByText("Row 5: the date was not understood.")).toBeTruthy();
  });

  it("[AC-MIL-04.1] explains a file without the right columns, and a wrong file type", async () => {
    open();
    await choose(file("Day,Odometer\n1,2\n"));
    expect((await screen.findByRole("alert")).textContent).toContain("Date column and a Start Miles column");
    await choose(file("x", "photo.png"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Excel (.xlsx) or CSV"));
  });

  it("[AC-MIL-04.4][AC-MIL-04.5] imports once, sends only parsed rows (no miles driven, no file), and a second import adds nothing", async () => {
    const api = createDemoApi();
    const spy = vi.spyOn(api, "importReadings");
    open(api);
    for (const expected of ["Imported 3 readings. 0 were already saved", "Imported 0 readings. 3 were already saved"]) {
      await choose(file());
      await userEvent.click(await screen.findByRole("button", { name: "Import 3 readings" }));
      expect((await screen.findByRole("status")).textContent).toContain(expected);
    }
    expect(spy.mock.calls[0]![0]).toEqual([
      { date: "2026-01-02", miles: 1000 },
      { date: "2026-01-09", miles: 1120 },
      { date: "2026-01-16", miles: 1150 },
    ]);
  });

  it("[AC-MIL-04.1] shows a failure and keeps the preview so the owner can try again", async () => {
    const api = createDemoApi();
    api.importReadings = async () => {
      throw new Error("down");
    };
    open(api);
    await choose(file());
    await userEvent.click(await screen.findByRole("button", { name: "Import 3 readings" }));
    expect((await screen.findAllByRole("alert")).map((a) => a.textContent).join(" ")).toContain("did not work");
    expect(screen.getByRole("button", { name: "Import 3 readings" })).toBeTruthy();
  });
});
