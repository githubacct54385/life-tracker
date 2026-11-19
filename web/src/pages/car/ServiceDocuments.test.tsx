import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useEffect, useState } from "react";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS_PER_RECORD, type MaintenanceDocument } from "@life-tracker/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { formatSize } from "./documentFormat";
import { prepareDocument } from "./prepareDocument";
import { ServiceDocuments } from "./ServiceDocuments";

afterEach(cleanup);

// Synthetic files: the first bytes of each type, then filler. Not real images.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
const file = (bytes: number[] | string, name: string, type: string) => new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], name, { type });
const png = (n = 0) => file([...PNG, n], "receipt.png", "image/png");
const bigPhoto = () => new File([new Uint8Array(3 * 1024 * 1024)], "big.png", { type: "image/png" });
const pdf = () => file("%PDF-1.7 synthetic", "invoice.pdf", "application/pdf");
// jsdom has no canvas, so the redraw is replaced by one that returns a small PNG.
const shrink = vi.fn(async () => new Blob([new Uint8Array(PNG)], { type: "image/png" }));

function Harness({ api, recordId }: { api: Api; recordId: number }) {
  const [documents, setDocuments] = useState<MaintenanceDocument[]>([]);
  const load = useCallback(async () => setDocuments((await api.listDocuments()).documents.filter((d) => d.recordId === recordId)), [api, recordId]);
  useEffect(() => void load(), [load]);
  return <ServiceDocuments recordId={recordId} label="Oil change on Nov 3" documents={documents} onChanged={load} shrink={shrink} />;
}

const demo = () => createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
async function open(api: Api = demo(), existing = 0) {
  const recordId = (await api.listMaintenance()).records[0]!.id;
  for (let i = 0; i < existing; i += 1) await api.uploadDocument(recordId, png(i));
  render(
    <ApiProvider api={api}>
      <Harness api={api} recordId={recordId} />
    </ApiProvider>,
  );
  return { api, recordId };
}
const chooser = () => screen.getByLabelText("Add a photo or PDF to Oil change on Nov 3") as HTMLInputElement;
// The input accepts only photos and PDFs, so fireEvent is used to hand it any file, as a drag or an old browser could.
const choose = (f: File) => fireEvent.change(chooser(), { target: { files: [f] } });
const addIt = async () => userEvent.click(await screen.findByRole("button", { name: "Add to this service" }));
const chooseAndAdd = async (f: File) => {
  choose(f);
  await addIt();
};

describe("choosing a document", () => {
  it("[AC-MIL-07.11] shows the size of a chosen photo, and how much smaller it was made, before anything is stored", async () => {
    const { api } = await open();
    choose(bigPhoto());
    expect((await screen.findByText(/Ready to add/)).textContent).toBe("Ready to add: Photo, 1 KB (made smaller from 3.0 MB)");
    expect((await api.listDocuments()).documents).toHaveLength(0);
  });

  it("[AC-MIL-07.11] shows the size of a chosen PDF, stores it only after Add, and keeps nothing after Cancel", async () => {
    const { api } = await open();
    choose(pdf());
    expect((await screen.findByText(/Ready to add/)).textContent).toBe("Ready to add: PDF, 1 KB");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Ready to add/)).toBeNull();
    expect((await api.listDocuments()).documents).toHaveLength(0);
    choose(pdf());
    await addIt();
    expect(await screen.findByText(/PDF 1/)).toBeTruthy();
    expect((await api.listDocuments()).documents).toHaveLength(1);
  });

  it("[AC-MIL-07.3] refuses a file over 100 MB before sending it, and says so", async () => {
    const big = Object.defineProperty(new File([], "huge.pdf", { type: "application/pdf" }), "size", { value: MAX_DOCUMENT_BYTES + 1 });
    expect(await prepareDocument(big)).toEqual({ status: "too_large" });
    const { api } = await open();
    const upload = vi.spyOn(api, "uploadDocument");
    choose(big);
    expect((await screen.findByRole("alert")).textContent).toBe("That file is over 100 MB. Choose a smaller one.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("[AC-MIL-07.3] says so when a photo cannot be read, and sends nothing", async () => {
    const failing = vi.fn(async () => {
      throw new Error("cannot decode");
    });
    expect(await prepareDocument(png(), failing)).toEqual({ status: "unreadable" });
  });

  it("[AC-MIL-07.3] redraws a photo smaller before sending it, but sends a PDF as it is", async () => {
    shrink.mockClear();
    await open();
    await chooseAndAdd(png());
    await screen.findByRole("button", { name: "View Photo 1" });
    expect(shrink).toHaveBeenCalledTimes(1);
    await chooseAndAdd(pdf());
    await screen.findByText(/PDF 2/);
    expect(shrink).toHaveBeenCalledTimes(1);
  });

  it("[AC-MIL-07.3] shows the server's refusal for a file that is not a photo or PDF", async () => {
    await open();
    await chooseAndAdd(file("just some text", "notes.pdf", "application/pdf"));
    expect((await screen.findByRole("alert")).textContent).toContain("Only photos (JPEG, PNG or WebP) and PDFs");
    expect(screen.queryByRole("button", { name: /View/ })).toBeNull();
  });

  it("[AC-MIL-07.10] says when the service is full of documents or past its total size", async () => {
    const api = demo();
    api.uploadDocument = async () => ({ status: "too_much" });
    await open(api);
    await chooseAndAdd(pdf());
    expect((await screen.findByRole("alert")).textContent).toBe("One service can hold 250 MB of documents in all. Delete one to make room.");
  });

  it("[AC-MIL-07.4] stops offering to add at 10 and says why", async () => {
    await open(undefined, MAX_DOCUMENTS_PER_RECORD);
    expect(await screen.findByText(/10 documents is the most for one service/)).toBeTruthy();
    expect(screen.queryByLabelText(/Add a photo or PDF/)).toBeNull();
  });
});

describe("documents on a service", () => {
  it("[AC-MIL-07.11] shows every document with its size, and the total for the service, with no file name anywhere", async () => {
    await open();
    await chooseAndAdd(png());
    expect(await screen.findByText(/Photo 1 · 1 KB/)).toBeTruthy();
    expect(screen.getByText(/1 · 1 KB in all/)).toBeTruthy();
    expect((await screen.findByRole("status")).textContent).toBe("Added 1 KB.");
    await chooseAndAdd(pdf());
    expect(await screen.findByText(/PDF 2 · 1 KB/)).toBeTruthy();
    expect(screen.getByText(/2 · 1 KB in all/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/receipt\.png|invoice\.pdf/);
  });

  it("[AC-MIL-07.12] opens a photo full screen with Back and Download, Escape also closes it, and focus goes back", async () => {
    await open();
    await chooseAndAdd(png());
    const view = await screen.findByRole("button", { name: "View Photo 1" });
    await userEvent.click(view);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Back" }));
    expect(within(dialog).getByRole("img").getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    expect(within(dialog).getByRole("link", { name: "Download" }).hasAttribute("download")).toBe(true);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "View Photo 1" }));
    await userEvent.click(screen.getByRole("button", { name: "View Photo 1" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("[AC-MIL-07.12][AC-MIL-07.13] a PDF opens in the browser's viewer in a new tab and can be downloaded", async () => {
    const api = demo();
    api.documentUrl = (d) => `/api/maintenance/documents/${d.id}`;
    api.documentDownloadUrl = (d) => `/api/maintenance/documents/${d.id}?download=1`;
    await open(api);
    await chooseAndAdd(pdf());
    const link = await screen.findByRole("link", { name: /Open PDF 1/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: "Download PDF 1" }).getAttribute("href")).toBe("/api/maintenance/documents/1?download=1");
  });

  it("[AC-MIL-07.6] asks before deleting, keeps the document on Keep it, and removes it on Yes", async () => {
    const { api } = await open();
    await chooseAndAdd(png());
    await screen.findByRole("button", { name: "View Photo 1" });
    await userEvent.click(screen.getByRole("button", { name: "Delete Photo 1" }));
    expect(screen.getByRole("alert").textContent).toContain("Delete Photo 1? It is removed for good.");
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect((await api.listDocuments()).documents).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Delete Photo 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "View Photo 1" })).toBeNull());
    expect((await api.listDocuments()).documents).toHaveLength(0);
    expect(await screen.findByText("Document deleted.")).toBeTruthy();
  });

  it("[AC-MIL-07.6] a document whose file is missing says so, and can still be deleted", async () => {
    await open();
    await chooseAndAdd(png());
    const view = await screen.findByRole("button", { name: "View Photo 1" });
    fireEvent.error(view.querySelector("img")!);
    expect(await screen.findByText("Photo 1 (the file is missing)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete Photo 1" })).toBeTruthy();
  });

  it("[AC-MIL-07.3] shows a busy state while a document is added and cannot be started twice", async () => {
    const api = demo();
    let release: () => void = () => {};
    const real = api.uploadDocument.bind(api);
    api.uploadDocument = (id, f) => new Promise((resolve) => (release = () => resolve(real(id, f))));
    await open(api);
    choose(pdf());
    const add = await screen.findByRole("button", { name: /Add to this service/ });
    await userEvent.click(add);
    await waitFor(() => expect(add.hasAttribute("disabled")).toBe(true));
    release();
    await screen.findByText(/PDF 1/);
  });

  it("[AC-MIL-07.3] says that it did not work when the request fails", async () => {
    const api = demo();
    api.uploadDocument = async () => {
      throw new Error("offline");
    };
    await open(api);
    await chooseAndAdd(pdf());
    expect((await screen.findByRole("alert")).textContent).toBe("That did not work. Try again.");
  });
});

describe("sizes", () => {
  it("[AC-MIL-07.11] formats sizes for people", () => {
    expect([1, 900, 1024, 1536, 850 * 1024, 1024 * 1024, 5.2 * 1024 * 1024, 36 * 1024 * 1024].map(formatSize)).toEqual(["1 KB", "1 KB", "1 KB", "2 KB", "850 KB", "1.0 MB", "5.2 MB", "36.0 MB"]);
  });
});
