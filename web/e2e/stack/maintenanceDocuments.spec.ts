import { request, type Page } from "@playwright/test";
import { expect, test } from "../support/stack";

// MIL-07, full stack: the real Worker with its R2 binding (wrangler dev keeps the bucket on disk), the real API and a real Postgres.
// A 1x1 pixel PNG, made up for the test. No real document is ever used.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n% synthetic test document\n");

async function addService(page: Page) {
  await page.goto("/car/maintenance");
  await page.getByRole("checkbox", { name: "Oil change" }).check();
  await page.getByRole("radio", { name: "I did it myself" }).check();
  await page.getByRole("button", { name: "Save service" }).click();
  await expect(page.getByRole("status")).toContainText("Saved Oil change.");
  return page.getByRole("region", { name: "Services" }).getByRole("list").getByRole("listitem").first();
}
const chooser = (page: Page) => page.getByLabel(/Add a photo or PDF to/).first();
type Upload = { name: string; mimeType: string; buffer: Buffer };
/** Chooses a file, then presses Add, as a person does: the size is shown first and nothing is stored until Add. */
async function addDocument(page: Page, file: Upload) {
  await chooser(page).setInputFiles(file);
  await page.getByRole("button", { name: "Add to this service" }).click();
}

test("[AC-MIL-07.2][AC-MIL-07.3][AC-MIL-07.5] a photo is attached, shown, kept after a reload and served privately from R2", { tag: "@AC-MIL-07.5" }, async ({ page }) => {
  const row = await addService(page);
  await chooser(page).setInputFiles({ name: "receipt-of-jane-doe.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText(/Ready to add: Photo/)).toBeVisible();
  expect((await page.request.get("/api/maintenance/documents")).ok()).toBe(true);
  expect(((await (await page.request.get("/api/maintenance/documents")).json()) as { documents: unknown[] }).documents).toHaveLength(0); // nothing is stored before Add
  await page.getByRole("button", { name: "Add to this service" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Added/ })).toBeVisible();
  const photo = row.getByRole("button", { name: "View Photo 1" }).locator("img");
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // The page redrew the photo as a JPEG (which drops location data) before sending it.
  const src = (await photo.getAttribute("src"))!;
  expect(src).toMatch(/^\/api\/maintenance\/documents\/\d+$/);
  const served = await page.request.get(src);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/jpeg");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  expect(served.headers()["cache-control"]).toBe("private, no-store");
  expect(served.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect([...(await served.body()).subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

  // No file name is kept or shown anywhere, and the document is still there after a reload.
  await page.reload();
  await expect(page.getByRole("button", { name: "View Photo 1" })).toBeVisible();
  expect(await page.content()).not.toContain("jane-doe");
  const list = await (await page.request.get("/api/maintenance/documents")).text();
  expect(list).not.toMatch(/jane-doe|objectKey|filename/i);
});

test("[AC-MIL-07.3] a PDF is attached and served as a PDF, and a file that is not a photo or PDF is refused with nothing stored", { tag: "@AC-MIL-07.3" }, async ({ page }) => {
  const row = await addService(page);
  await addDocument(page, { name: "invoice.pdf", mimeType: "application/pdf", buffer: PDF });
  const link = row.getByRole("link", { name: /Open PDF 1/ });
  await expect(link).toBeVisible();
  const served = await page.request.get((await link.getAttribute("href"))!);
  expect(served.headers()["content-type"]).toBe("application/pdf");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");

  // The name and the claimed type say PDF, the bytes say text: the server refuses it.
  await addDocument(page, { name: "not-really.pdf", mimeType: "application/pdf", buffer: Buffer.from("just some text") });
  await expect(page.getByRole("alert")).toContainText("Only photos (JPEG, PNG or WebP) and PDFs can be added.");
  await expect(row.getByText(/PDF 2/)).toHaveCount(0);
  const documents = (await (await page.request.get("/api/maintenance/documents")).json()) as { documents: unknown[] };
  expect(documents.documents).toHaveLength(1);
});

test("[AC-MIL-07.6] deleting a document, and deleting a service, removes the stored files", { tag: "@AC-MIL-07.6" }, async ({ page }) => {
  const row = await addService(page);
  await addDocument(page, { name: "a.png", mimeType: "image/png", buffer: PNG });
  await expect(row.getByRole("button", { name: "View Photo 1" })).toBeVisible();
  const first = (await row.getByRole("button", { name: "View Photo 1" }).locator("img").getAttribute("src"))!;
  await addDocument(page, { name: "b.pdf", mimeType: "application/pdf", buffer: PDF });
  const second = (await row.getByRole("link", { name: /Open PDF 2/ }).getAttribute("href"))!;

  await row.getByRole("button", { name: "Delete Photo 1" }).click();
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await expect(row.getByRole("button", { name: "View Photo 1" })).toHaveCount(0);
  expect((await page.request.get(first)).status()).toBe(404);
  expect((await page.request.get(second)).status()).toBe(200);

  await row.getByRole("button", { name: /Delete service/ }).click();
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText("No services yet.")).toBeVisible();
  expect((await page.request.get(second)).status()).toBe(404);
  expect(((await (await page.request.get("/api/maintenance/documents")).json()) as { documents: unknown[] }).documents).toEqual([]);
});

test("[AC-MIL-07.2] without the owner's sign-in no document can be read, added or removed", { tag: "@AC-MIL-07.2" }, async ({ page }) => {
  await addService(page);
  await addDocument(page, { name: "a.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("button", { name: "View Photo 1" })).toBeVisible();
  const anonymous = await request.newContext({ baseURL: "http://127.0.0.1:8788" });
  expect((await anonymous.get("/api/maintenance/documents")).status()).toBe(401);
  expect((await anonymous.get("/api/maintenance/documents/1")).status()).toBe(401);
  expect((await anonymous.post("/api/maintenance/1/documents", { data: PNG, headers: { "content-type": "image/png", "x-life-tracker": "1" } })).status()).toBe(401);
  expect((await anonymous.delete("/api/maintenance/documents/1", { headers: { "x-life-tracker": "1" } })).status()).toBe(401);
  await anonymous.dispose();
});

test("[AC-MIL-07.10][AC-MIL-07.11] a 36 MB PDF is shown with its size before it is added, streams through the real Worker into R2, and comes back whole", { tag: "@AC-MIL-07.10" }, async ({ page }) => {
  test.setTimeout(120_000);
  const row = await addService(page);
  const big = Buffer.alloc(36 * 1024 * 1024, 7);
  PDF.copy(big);
  await chooser(page).setInputFiles({ name: "big-scan.pdf", mimeType: "application/pdf", buffer: big });
  await expect(page.getByText(/Ready to add: PDF, 36\.0 MB/)).toBeVisible();
  await page.getByRole("button", { name: "Add to this service" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added 36.0 MB." })).toBeVisible({ timeout: 90_000 });
  await expect(row.getByText(/1 · 36\.0 MB in all/)).toBeVisible();
  const link = row.getByRole("link", { name: /Open PDF 1/ });
  const served = await page.request.get((await link.getAttribute("href"))!);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-length"]).toBe(String(big.length));
  const body = await served.body();
  expect(body.length).toBe(big.length);
  expect(body.subarray(0, 8).toString()).toBe("%PDF-1.4");
  expect(body[body.length - 1]).toBe(7);
});

test("[AC-MIL-07.12][AC-MIL-07.13] a photo opens full screen from the Recent documents list, and Download saves it under a made-up name", { tag: "@AC-MIL-07.12" }, async ({ page }) => {
  await addService(page);
  await addDocument(page, { name: "receipt-of-jane-doe.png", mimeType: "image/png", buffer: PNG });
  const recent = page.getByRole("region", { name: "Recent documents" });
  await expect(recent).toBeVisible();
  await expect(recent.getByText(/Oil change on/)).toBeVisible();
  await recent.getByRole("button", { name: /View photo: Oil change/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.getByRole("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(dialog.getByRole("button", { name: "Back" })).toBeFocused();
  const href = (await dialog.getByRole("link", { name: "Download" }).getAttribute("href"))!;
  expect(href).toMatch(/^\/api\/maintenance\/documents\/\d+\?download=1$/);
  const download = await page.request.get(href);
  expect(download.headers()["content-disposition"]).toMatch(/^attachment; filename="life-tracker-document-\d+\.jpg"$/);
  expect(download.headers()["cache-control"]).toBe("private, no-store");
  expect(download.headers()["content-disposition"]).not.toContain("jane-doe");
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.content()).not.toContain("jane-doe");
});
