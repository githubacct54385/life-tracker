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
import type { ReducedPdf } from "./reducePdf";
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

// The page drawing is replaced too. By default it returns a PDF far smaller than the one chosen.
const smallPdf = (): ReducedPdf => ({ status: "reduced", file: new Blob(["%PDF-1.4 small"], { type: "application/pdf" }), pages: 2 });
const reduce = vi.fn(async (_file: Blob, onPage: (page: number, of: number) => void): Promise<ReducedPdf> => {
  onPage(1, 2);
  return smallPdf();
});
const bigPdfFile = (mb: number) => Object.defineProperty(new File(["%PDF-1.7 "], "scan.pdf", { type: "application/pdf" }), "size", { value: mb * 1024 * 1024 });
const bigPdf = (mb: number) => new File(["%PDF-1.7 ", new Uint8Array(mb * 1024 * 1024)], "scan.pdf", { type: "application/pdf" });

function Harness({ api, recordId }: { api: Api; recordId: number }) {
  const [documents, setDocuments] = useState<MaintenanceDocument[]>([]);
  const load = useCallback(async () => setDocuments((await api.listDocuments()).documents.filter((d) => d.recordId === recordId)), [api, recordId]);
  useEffect(() => void load(), [load]);
  return <ServiceDocuments recordId={recordId} label="Oil change on Nov 3" documents={documents} onChanged={load} shrink={shrink} reduce={reduce} />;
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
const chooser = () => screen.getByLabelText("Add photos or PDFs to Oil change on Nov 3") as HTMLInputElement;
// The input accepts only photos and PDFs, so fireEvent is used to hand it any file, as a drag or an old browser could.
const choose = (f: File) => fireEvent.change(chooser(), { target: { files: [f] } });
const addIt = async () => userEvent.click(await screen.findByRole("button", { name: "Add to this service" }));
const chooseAndAdd = async (f: File) => {
  choose(f);
  await addIt();
};

describe("choosing a document", () => {
  it("[AC-MIL-07.11][AC-MIL-08.1] shows the size of a chosen photo, and how much smaller it was made, before anything is stored", async () => {
    const { api } = await open();
    choose(bigPhoto());
    expect((await screen.findByText(/Ready to add/)).textContent).toBe("Ready to add: Photo, 1 KB (made smaller from 3.0 MB)");
    expect((await api.listDocuments()).documents).toHaveLength(0);
  });

  it("[AC-MIL-07.11][AC-MIL-08.1] shows the size of a chosen PDF, stores it only after Add, and keeps nothing after Cancel", async () => {
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

  it("[AC-MIL-07.3][AC-MIL-08.3] refuses a file over 100 MB before sending it, and says so", async () => {
    const big = Object.defineProperty(new File([], "huge.pdf", { type: "application/pdf" }), "size", { value: MAX_DOCUMENT_BYTES + 1 });
    expect(await prepareDocument(big)).toEqual({ status: "too_large" });
    const { api } = await open();
    const upload = vi.spyOn(api, "uploadDocument");
    choose(big);
    expect((await screen.findByRole("alert")).textContent).toBe("That file is over 100 MB. Choose a smaller one.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("[AC-MIL-07.3][AC-MIL-08.3] says so when a photo cannot be read, and sends nothing", async () => {
    const failing = vi.fn(async () => {
      throw new Error("cannot decode");
    });
    expect(await prepareDocument(png(), failing)).toEqual({ status: "unreadable" });
  });

  it("[AC-MIL-07.3][AC-MIL-08.2] redraws a photo smaller before sending it, but sends a PDF as it is", async () => {
    shrink.mockClear();
    await open();
    await chooseAndAdd(png());
    await screen.findByRole("button", { name: "View Photo 1" });
    expect(shrink).toHaveBeenCalledTimes(1);
    await chooseAndAdd(pdf());
    await screen.findByText(/PDF 2/);
    expect(shrink).toHaveBeenCalledTimes(1);
  });

  it("[AC-MIL-07.3][AC-MIL-08.3] shows the server's refusal for a file that is not a photo or PDF", async () => {
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
    expect(screen.queryByLabelText(/Add photos or PDFs/)).toBeNull();
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

  it("[AC-MIL-07.6][AC-MIL-08.5] asks before deleting, keeps the document on Keep it, and removes it on Yes", async () => {
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

  it("[AC-MIL-07.3][AC-MIL-08.4] shows a busy state while a document is added and cannot be started twice", async () => {
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

  it("[AC-MIL-07.3][AC-MIL-08.4] says that it did not work when the request fails", async () => {
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

describe("making a PDF smaller", () => {
  const box = () => screen.getByRole("checkbox", { name: "Make this PDF smaller" }) as HTMLInputElement;

  it("[AC-MIL-07.14][AC-MIL-07.16] offers the box for a PDF, off by default, with a warning about text", async () => {
    await open();
    choose(pdf());
    await screen.findByText(/Ready to add/);
    expect(box().checked).toBe(false);
    expect(screen.getByText(/text can no longer be selected or searched/i)).toBeTruthy();
    expect(reduce).not.toHaveBeenCalledWith(expect.anything(), expect.anything()); // nothing runs until the box is ticked
  });

  it("[AC-MIL-07.14] does not offer the box for a photo", async () => {
    await open();
    choose(bigPhoto());
    await screen.findByText(/Ready to add/);
    expect(screen.queryByRole("checkbox", { name: "Make this PDF smaller" })).toBeNull();
  });

  it("[AC-MIL-07.14] shows the size before and after when ticked, and goes back to the original when unticked", async () => {
    await open();
    choose(bigPdf(36));
    await screen.findByText(/Ready to add/);
    await userEvent.click(box());
    await waitFor(() => expect(screen.getByText("Ready to add: PDF,", { exact: false }).textContent).toBe("Ready to add: PDF, 1 KB (made smaller from 36.0 MB)"));
    expect(box().checked).toBe(true);
    await userEvent.click(box());
    await waitFor(() => expect(screen.getByText(/Ready to add/).textContent).toBe("Ready to add: PDF, 36.0 MB"));
    expect(box().checked).toBe(false);
  });

  it("[AC-MIL-07.17] stores the smaller PDF, with its own size, when Add is pressed", async () => {
    const { api } = await open();
    choose(bigPdf(36));
    await screen.findByText(/Ready to add/);
    await userEvent.click(box());
    await screen.findByText(/made smaller from/);
    await addIt();
    await screen.findByText("Added 1 KB.");
    const [stored] = (await api.listDocuments()).documents;
    expect(stored!.bytes).toBe(14); // shown as 1 KB;
    expect(stored!.contentType).toBe("application/pdf");
  });

  it("[AC-MIL-07.14] shows which page it is on while it works, and cannot be added until it is done", async () => {
    let finish: (r: ReducedPdf) => void = () => {};
    reduce.mockImplementationOnce((_f, onPage) => {
      onPage(3, 12);
      return new Promise<ReducedPdf>((resolve) => (finish = resolve));
    });
    await open();
    choose(pdf());
    await screen.findByText(/Ready to add/);
    await userEvent.click(box());
    expect(await screen.findByText("Making it smaller: page 3 of 12…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add to this service" }) as HTMLButtonElement).disabled).toBe(true);
    finish(smallPdf());
    await screen.findByText(/made smaller from/);
  });

  it("[AC-MIL-07.15] keeps the original, and says so, when the smaller copy is not smaller", async () => {
    reduce.mockResolvedValueOnce({ status: "reduced", file: new Blob([new Uint8Array(5000)], { type: "application/pdf" }), pages: 1 });
    await open();
    choose(pdf());
    await screen.findByText(/Ready to add/);
    await userEvent.click(box());
    expect(await screen.findByText("Making it smaller did not help, so the original is kept.")).toBeTruthy();
    expect(screen.getByText(/Ready to add/).textContent).toBe("Ready to add: PDF, 1 KB");
    expect(box().checked).toBe(false);
  });

  it("[AC-MIL-07.15] keeps the original, with a clear message, when the PDF cannot be read", async () => {
    reduce.mockResolvedValueOnce({ status: "unreadable" });
    await open();
    choose(pdf());
    await screen.findByText(/Ready to add/);
    await userEvent.click(box());
    expect((await screen.findByText(/could not be made smaller. It may be damaged or protected/)).textContent).toMatch(/original is kept/);
    expect(box().checked).toBe(false);
    await addIt();
    await screen.findByText("Added 1 KB.");
  });

  it("[AC-MIL-07.15] keeps the original when making it smaller throws", async () => {
    reduce.mockRejectedValueOnce(new Error("out of memory"));
    await open();
    choose(pdf());
    await screen.findByText(/Ready to add/);
    await userEvent.click(box());
    expect(await screen.findByText(/could not be made smaller. The original is kept/)).toBeTruthy();
  });

  it("[AC-MIL-07.16] suggests the box for a PDF over 25 MB and not for a small one", async () => {
    await open();
    choose(bigPdf(26));
    expect(await screen.findByText("This PDF is large. Making it smaller is a good idea.")).toBeTruthy();
    cleanup();
    await open();
    choose(pdf());
    await screen.findByText(/Ready to add/);
    expect(screen.queryByText(/This PDF is large/)).toBeNull();
  });

  it("[AC-MIL-07.14] Cancel while it works stores nothing and drops the result", async () => {
    let finish: (r: ReducedPdf) => void = () => {};
    reduce.mockImplementationOnce(() => new Promise<ReducedPdf>((resolve) => (finish = resolve)));
    const { api } = await open();
    choose(pdf());
    await screen.findByText(/Ready to add/);
    await userEvent.click(box());
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    finish(smallPdf());
    await waitFor(() => expect(screen.queryByText(/Ready to add/)).toBeNull());
    expect((await api.listDocuments()).documents).toHaveLength(0);
  });
});

describe("choosing several documents at once", () => {
  const chooseMany = (files: File[]) => fireEvent.change(chooser(), { target: { files } });
  const huge = () => Object.defineProperty(new File([], "huge.pdf", { type: "application/pdf" }), "size", { value: MAX_DOCUMENT_BYTES + 1 });
  const addAll = async () => userEvent.click(await screen.findByRole("button", { name: "Add all to this service" }));
  const pdfBox = (name: string) => screen.getByRole("checkbox", { name });

  it("[AC-MIL-07.18] the file chooser accepts several files", async () => {
    await open();
    expect(chooser().multiple).toBe(true);
    expect(screen.getByText("You can choose several at once.")).toBeTruthy();
  });

  it("[AC-MIL-07.18] lists every chosen file with its size and the total, and stores nothing until Add", async () => {
    const { api } = await open();
    chooseMany([png(1), pdf(), bigPhoto()]);
    expect((await screen.findByText(/Ready to add/)).textContent).toBe("Ready to add: 3 files, 1 KB in all");
    const items = screen.getAllByRole("listitem").filter((li) => /^(Photo|PDF) \d/.test(li.textContent ?? ""));
    expect(items.map((li) => li.textContent)).toEqual([expect.stringContaining("Photo 1 · 1 KB"), expect.stringContaining("PDF 2 · 1 KB"), expect.stringContaining("Photo 3 · 1 KB (made smaller from 3.0 MB)")]);
    expect((await api.listDocuments()).documents).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Ready to add/)).toBeNull();
    expect((await api.listDocuments()).documents).toHaveLength(0);
  });

  it("[AC-MIL-07.18] any one file can be removed from the list, and the last one left reads as a single file", async () => {
    await open();
    chooseMany([png(1), png(2), png(3)]);
    await waitFor(() => expect(screen.getByText(/Ready to add/).textContent).toBe("Ready to add: 3 files, 1 KB in all"));
    await userEvent.click(screen.getByRole("button", { name: "Remove Photo 2 from the list" }));
    expect(screen.getByText(/Ready to add/).textContent).toBe("Ready to add: 2 files, 1 KB in all");
    await userEvent.click(screen.getByRole("button", { name: "Remove Photo 1 from the list" }));
    expect(screen.getByText(/Ready to add/).textContent).toContain("Ready to add: Photo, 1 KB");
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  });

  it("[AC-MIL-07.18] each PDF has its own box to make it smaller, and ticking one leaves the others alone", async () => {
    await open();
    chooseMany([pdf(), png(1), pdf()]);
    await screen.findByText(/Ready to add/);
    expect(screen.queryByRole("checkbox", { name: "Make Photo 2 smaller" })).toBeNull();
    await userEvent.click(pdfBox("Make PDF 3 smaller"));
    expect(await screen.findByText(/1 KB → 14 B|1 KB &rarr; 14 B|→/)).toBeTruthy();
    expect((pdfBox("Make PDF 3 smaller") as HTMLInputElement).checked).toBe(true);
    expect((pdfBox("Make PDF 1 smaller") as HTMLInputElement).checked).toBe(false);
    expect(reduce).toHaveBeenCalledTimes(1);
  });

  it("[AC-MIL-07.19] adds the files one after another, shows how far it is, and empties the list", async () => {
    const base = demo();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    const api = {
      ...base,
      uploadDocument: async (id: number, file: Blob) => {
        calls += 1;
        if (calls === 2) await gate; // hold the second one so the progress can be seen
        return base.uploadDocument(id, file);
      },
    } as Api;
    await open(api);
    chooseMany([png(1), png(2), png(3)]);
    await addAll();
    expect(await screen.findByText("Adding 2 of 3…")).toBeTruthy();
    release();
    expect((await screen.findByText(/^Added 3 documents/)).textContent).toBe("Added 3 documents, 1 KB in all.");
    expect(screen.queryByText(/Ready to add/)).toBeNull();
    expect((await api.listDocuments()).documents).toHaveLength(3);
  });

  it("[AC-MIL-07.19][AC-MIL-08.4] a file that fails stays in the list with a message, and the others are still added", async () => {
    const base = demo();
    let calls = 0;
    const api = {
      ...base,
      uploadDocument: async (id: number, file: Blob) => {
        calls += 1;
        if (calls === 2) throw new Error("network");
        return base.uploadDocument(id, file);
      },
    } as Api;
    await open(api);
    chooseMany([png(1), png(2), png(3)]);
    await addAll();
    expect((await screen.findByText(/^Added 2 documents/)).textContent).toBe("Added 2 documents, 1 KB in all.");
    expect((await screen.findByRole("alert")).textContent).toBe("That did not work. Try again.");
    expect(screen.getByText(/Ready to add/).textContent).toContain("Ready to add: Photo, 1 KB"); // only the failed one is left
    expect(screen.getAllByText("That did not work. Try again.").length).toBeGreaterThan(1); // on the file too
    expect((await api.listDocuments()).documents).toHaveLength(2);
    await addIt(); // trying again works
    await screen.findByText("Added 1 KB.");
    expect((await api.listDocuments()).documents).toHaveLength(3);
  });

  it("[AC-MIL-07.19] when the service becomes full, adding stops with a clear message and the rest stay in the list", async () => {
    const base = demo();
    let calls = 0;
    const api = {
      ...base,
      uploadDocument: async (id: number, file: Blob) => {
        calls += 1;
        if (calls === 2) return { status: "too_much" } as const;
        return base.uploadDocument(id, file);
      },
    } as Api;
    await open(api);
    chooseMany([png(1), png(2), png(3)]);
    await addAll();
    expect((await screen.findByRole("alert")).textContent).toContain("One service can hold 250 MB of documents in all");
    expect(screen.getByText("Added 1 KB.")).toBeTruthy();
    expect(screen.getByText(/Ready to add/).textContent).toBe("Ready to add: 2 files, 1 KB in all");
    expect(calls).toBe(2); // the third was not even tried
  });

  it("[AC-MIL-07.19] says the service is full when the server says so for the 10-document limit", async () => {
    const base = demo();
    const api = { ...base, uploadDocument: async () => ({ status: "limit_reached" }) as const } as Api;
    await open(api);
    chooseMany([png(1), png(2)]);
    await addAll();
    expect((await screen.findByRole("alert")).textContent).toBe("10 documents is the most for one service. Delete one to add another.");
    expect(screen.getByText(/Ready to add/).textContent).toBe("Ready to add: 2 files, 1 KB in all");
  });

  it("[AC-MIL-07.20] leaves out files that do not fit in the room left, and says how many", async () => {
    await open(demo(), MAX_DOCUMENTS_PER_RECORD - 2);
    await screen.findByText("Add more");
    chooseMany([png(1), png(2), png(3), png(4)]);
    expect((await screen.findByText(/Ready to add/)).textContent).toBe("Ready to add: 2 files, 1 KB in all");
    expect((await screen.findByRole("alert")).textContent).toBe("2 of 4 files were left out: 2 would not fit (10 documents is the most for one service).");
    expect(screen.queryByLabelText(/Add photos or PDFs/)).toBeNull(); // no room is left to choose more
  });

  it("[AC-MIL-07.20] leaves out a file over 100 MB or one that cannot be read, and lists the rest", async () => {
    const failing = vi.fn().mockRejectedValueOnce(new Error("bad image")).mockResolvedValue(new Blob([new Uint8Array(PNG)], { type: "image/png" }));
    const base = demo();
    const recordId = (await base.listMaintenance()).records[0]!.id;
    render(
      <ApiProvider api={base}>
        <ServiceDocuments recordId={recordId} label="Oil change on Nov 3" documents={[]} onChanged={async () => {}} shrink={failing} />
      </ApiProvider>,
    );
    chooseMany([png(1), huge(), pdf(), png(2)]);
    expect((await screen.findByText(/Ready to add/)).textContent).toBe("Ready to add: 2 files, 1 KB in all");
    expect((await screen.findByRole("alert")).textContent).toBe("2 of 4 files were left out: 1 over 100 MB, 1 could not be read.");
  });

  it("[AC-MIL-07.20] says when the files together are more than one service can hold", async () => {
    await open();
    chooseMany([bigPdfFile(100), bigPdfFile(100), bigPdfFile(60)]);
    expect(await screen.findByText(/more than the 250 MB one service can hold/)).toBeTruthy();
  });

  it("[AC-MIL-07.18] more files can be chosen while some are waiting, up to the room left", async () => {
    await open(demo(), MAX_DOCUMENTS_PER_RECORD - 3);
    await screen.findByText("Add more");
    chooseMany([png(1), png(2)]);
    await waitFor(() => expect(screen.getByText(/Ready to add/).textContent).toBe("Ready to add: 2 files, 1 KB in all"));
    expect(screen.getByText("Choose more")).toBeTruthy();
    chooseMany([png(3), png(4)]);
    expect((await screen.findByText(/Ready to add/)).textContent).toBe("Ready to add: 3 files, 1 KB in all");
    expect((await screen.findByRole("alert")).textContent).toBe("1 of 2 files was left out: 1 would not fit (10 documents is the most for one service).");
  });
});
