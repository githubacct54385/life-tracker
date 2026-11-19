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
const chooser = (page: Page) => page.getByLabel(/Add a photo or PDF to|Add another to/).first();

test("[AC-MIL-07.2][AC-MIL-07.3][AC-MIL-07.5][AC-MIL-07.9] a photo is attached, shown, kept after a reload and served privately from R2", { tag: "@AC-MIL-07.5" }, async ({ page }) => {
  const row = await addService(page);
  await chooser(page).setInputFiles({ name: "receipt-of-jane-doe.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("status").filter({ hasText: "Document added." })).toBeVisible();
  const photo = row.getByRole("img", { name: "Photo 1" });
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
  await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible();
  expect(await page.content()).not.toContain("jane-doe");
  const list = await (await page.request.get("/api/maintenance/documents")).text();
  expect(list).not.toMatch(/jane-doe|objectKey|filename/i);
});

test("[AC-MIL-07.3] a PDF is attached and served as a PDF, and a file that is not a photo or PDF is refused with nothing stored", { tag: "@AC-MIL-07.3" }, async ({ page }) => {
  const row = await addService(page);
  await chooser(page).setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: PDF });
  const link = row.getByRole("link", { name: /Open PDF 1/ });
  await expect(link).toBeVisible();
  const served = await page.request.get((await link.getAttribute("href"))!);
  expect(served.headers()["content-type"]).toBe("application/pdf");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");

  // The name and the claimed type say PDF, the bytes say text: the server refuses it.
  await chooser(page).setInputFiles({ name: "not-really.pdf", mimeType: "application/pdf", buffer: Buffer.from("just some text") });
  await expect(page.getByRole("alert")).toContainText("Only photos (JPEG, PNG or WebP) and PDFs can be added.");
  await expect(row.getByText(/PDF 2/)).toHaveCount(0);
  const documents = (await (await page.request.get("/api/maintenance/documents")).json()) as { documents: unknown[] };
  expect(documents.documents).toHaveLength(1);
});

test("[AC-MIL-07.6] deleting a document, and deleting a service, removes the stored files", { tag: "@AC-MIL-07.6" }, async ({ page }) => {
  const row = await addService(page);
  await chooser(page).setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
  await expect(row.getByRole("img", { name: "Photo 1" })).toBeVisible();
  const first = (await row.getByRole("img", { name: "Photo 1" }).getAttribute("src"))!;
  await chooser(page).setInputFiles({ name: "b.pdf", mimeType: "application/pdf", buffer: PDF });
  const second = (await row.getByRole("link", { name: /Open PDF 2/ }).getAttribute("href"))!;

  await row.getByRole("button", { name: "Delete Photo 1" }).click();
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await expect(row.getByRole("img", { name: "Photo 1" })).toHaveCount(0);
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
  await chooser(page).setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible();
  const anonymous = await request.newContext({ baseURL: "http://127.0.0.1:8788" });
  expect((await anonymous.get("/api/maintenance/documents")).status()).toBe(401);
  expect((await anonymous.get("/api/maintenance/documents/1")).status()).toBe(401);
  expect((await anonymous.post("/api/maintenance/1/documents", { data: PNG, headers: { "content-type": "image/png", "x-life-tracker": "1" } })).status()).toBe(401);
  expect((await anonymous.delete("/api/maintenance/documents/1", { headers: { "x-life-tracker": "1" } })).status()).toBe(401);
  await anonymous.dispose();
});
