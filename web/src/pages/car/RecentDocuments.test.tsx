import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { MaintenancePage } from "./MaintenancePage";

afterEach(cleanup);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
const photo = (n = 0) => new File([new Uint8Array([...PNG, n])], "x.png", { type: "image/png" });
const pdf = () => new File(["%PDF-1.7 synthetic"], "x.pdf", { type: "application/pdf" });
// Demo data: service 2 is the Nov 3 oil change and air filter, service 1 the Oct 12 wipers.
const demo = () => createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
function open(api: Api) {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <MaintenancePage today="2026-11-13" />
      </ApiProvider>
    </MemoryRouter>,
  );
}
const recent = () => screen.findByRole("region", { name: "Recent documents" });

describe("Recent documents", () => {
  it("[AC-MIL-07.12][AC-MIL-08.7] is not shown while there are no documents", async () => {
    open(demo());
    await screen.findByRole("region", { name: "Services" });
    expect(screen.queryByRole("region", { name: "Recent documents" })).toBeNull();
  });

  it("[AC-MIL-07.12] lists the newest first with the service, date, kind and size, at most 5", async () => {
    const api = demo();
    await api.uploadDocument(1, photo(1));
    await api.uploadDocument(2, photo(2));
    await api.uploadDocument(2, pdf());
    for (let i = 3; i < 6; i += 1) await api.uploadDocument(1, photo(i));
    open(api);
    const items = within(await recent()).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]!.textContent).toContain("Wipers on Oct 12");
    expect(items[0]!.textContent).toContain("Photo · 1 KB");
    expect(within(await recent()).getByText("Showing the 5 newest. The rest are under their services.")).toBeTruthy();
  });

  it("[AC-MIL-07.12] opens a photo full screen from the list, with Back", async () => {
    const api = demo();
    await api.uploadDocument(2, photo());
    open(api);
    await userEvent.click(await within(await recent()).findByRole("button", { name: "View photo: Oil change, Air filter on Nov 3" }));
    const dialog = await screen.findByRole("dialog", { name: "Photo for Oil change, Air filter on Nov 3" });
    expect(within(dialog).getByRole("img")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("[AC-MIL-07.13] has a Download link for each photo, and a PDF opens in a new tab", async () => {
    const api = demo();
    api.documentUrl = (d) => `/api/maintenance/documents/${d.id}`;
    api.documentDownloadUrl = (d) => `/api/maintenance/documents/${d.id}?download=1`;
    await api.uploadDocument(2, photo());
    await api.uploadDocument(2, pdf());
    open(api);
    const section = within(await recent());
    expect(section.getByRole("link", { name: "Download photo: Oil change, Air filter on Nov 3" }).getAttribute("href")).toBe("/api/maintenance/documents/1?download=1");
    const open2 = section.getByRole("link", { name: "Open PDF: Oil change, Air filter on Nov 3" });
    expect(open2.getAttribute("target")).toBe("_blank");
    expect(section.getByRole("link", { name: "Download pdf: Oil change, Air filter on Nov 3" }).hasAttribute("download")).toBe(true);
  });
});
