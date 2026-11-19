import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useEffect, useState } from "react";
import { MAX_DOCUMENTS_PER_RECORD, type MaintenanceDocument } from "@life-tracker/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { prepareDocument } from "./prepareDocument";
import { ServiceDocuments } from "./ServiceDocuments";

afterEach(cleanup);

// Synthetic files: the first bytes of each type, then filler. Not real images.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
const file = (bytes: number[] | string, name: string, type: string) => new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], name, { type });
const png = (n = 0) => file([...PNG, n], "receipt.png", "image/png");
const pdf = () => file("%PDF-1.7 synthetic", "invoice.pdf", "application/pdf");
// jsdom has no canvas, so the redraw is replaced by one that returns a small PNG.
const shrink = vi.fn(async () => new Blob([new Uint8Array(PNG)], { type: "image/png" }));

function Harness({ api, recordId }: { api: Api; recordId: number }) {
  const [documents, setDocuments] = useState<MaintenanceDocument[]>([]);
  const load = useCallback(async () => setDocuments((await api.listDocuments()).documents.filter((d) => d.recordId === recordId)), [api, recordId]);
  useEffect(() => void load(), [load]);
  return <ServiceDocuments recordId={recordId} label="Oil change on Nov 3" documents={documents} onChanged={load} shrink={shrink} />;
}

async function open(api: Api = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) }), existing = 0) {
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

describe("documents on a service", () => {
  it("[AC-MIL-07.3] shows a photo as a thumbnail that opens it, and a PDF by its size, with no file name anywhere", async () => {
    await open();
    expect(screen.getByText("Documents")).toBeTruthy();
    choose(png());
    const image = await screen.findByRole("img", { name: "Photo 1" });
    expect(image.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByRole("link", { name: "Open Photo 1" }).getAttribute("target")).toBe("_blank");
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Document added.");
    choose(pdf());
    expect(await screen.findByText(/PDF 2/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/receipt\.png|invoice\.pdf/);
  });

  it("[AC-MIL-07.3] redraws a photo smaller before sending it, but sends a PDF as it is", async () => {
    shrink.mockClear();
    await open();
    choose(png());
    await screen.findByRole("img", { name: "Photo 1" });
    expect(shrink).toHaveBeenCalledTimes(1);
    choose(pdf());
    await screen.findByText(/PDF 2/);
    expect(shrink).toHaveBeenCalledTimes(1);
  });

  it("[AC-MIL-07.3] says so when a photo cannot be read, and sends nothing", async () => {
    const { api } = await open();
    const upload = vi.spyOn(api, "uploadDocument");
    const failing = vi.fn(async () => {
      throw new Error("cannot decode");
    });
    expect(await prepareDocument(png(), failing)).toEqual({ status: "unreadable" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("[AC-MIL-07.3] refuses a file over 5 MB before sending it", async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    expect(await prepareDocument(big)).toEqual({ status: "too_large" });
    const { api } = await open();
    const upload = vi.spyOn(api, "uploadDocument");
    choose(big);
    expect((await screen.findByRole("alert")).textContent).toContain("over 5 MB");
    expect(upload).not.toHaveBeenCalled();
  });

  it("[AC-MIL-07.3] shows the server's refusal for a file that is not a photo or PDF", async () => {
    await open();
    choose(file("just some text", "notes.pdf", "application/pdf"));
    expect((await screen.findByRole("alert")).textContent).toContain("Only photos (JPEG, PNG or WebP) and PDFs");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("[AC-MIL-07.4] stops offering to add at 10 and says why", async () => {
    await open(undefined, MAX_DOCUMENTS_PER_RECORD);
    expect(await screen.findByText(/10 documents is the most for one service/)).toBeTruthy();
    expect(screen.queryByLabelText(/Add a photo or PDF/)).toBeNull();
  });

  it("[AC-MIL-07.6] asks before deleting, keeps the document on Keep it, and removes it on Yes", async () => {
    const { api } = await open();
    choose(png());
    await screen.findByRole("img", { name: "Photo 1" });
    await userEvent.click(screen.getByRole("button", { name: "Delete Photo 1" }));
    expect(screen.getByRole("alert").textContent).toContain("Delete Photo 1? It is removed for good.");
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect((await api.listDocuments()).documents).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Delete Photo 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByRole("img", { name: "Photo 1" })).toBeNull());
    expect((await api.listDocuments()).documents).toHaveLength(0);
    expect(await screen.findByText("Document deleted.")).toBeTruthy();
  });

  it("[AC-MIL-07.6] a document whose file is missing says so, and can still be deleted", async () => {
    await open();
    choose(png());
    const image = await screen.findByRole("img", { name: "Photo 1" });
    fireEvent.error(image);
    expect(await screen.findByText("Photo 1 (the file is missing)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete Photo 1" })).toBeTruthy();
  });

  it("[AC-MIL-07.3] shows a busy state while a document is added and cannot be started twice", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
    let release: () => void = () => {};
    const real = api.uploadDocument.bind(api);
    api.uploadDocument = (id, f) => new Promise((resolve) => (release = () => resolve(real(id, f))));
    await open(api);
    choose(pdf());
    expect(await screen.findByText("Adding…")).toBeTruthy();
    expect(chooser().disabled).toBe(true);
    release();
    await screen.findByText(/PDF 1/);
    expect(chooser().disabled).toBe(false);
  });

  it("[AC-MIL-07.3] says that it did not work when the request fails", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
    api.uploadDocument = async () => {
      throw new Error("offline");
    };
    await open(api);
    choose(pdf());
    expect((await screen.findByRole("alert")).textContent).toBe("That did not work. Try again.");
  });
});
