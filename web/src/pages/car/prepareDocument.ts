import { MAX_DOCUMENT_BYTES } from "@life-tracker/shared";

// Gets a chosen file ready to send (MIL-07, ADR-0024). A photo is redrawn smaller as a JPEG in the browser. Redrawing drops
// the location and camera data a phone puts in a photo, and keeps a photo well under the 5 MB limit. A PDF is sent as it is.
// The server still checks the type from the file's own bytes, so nothing here is trusted.

export const MAX_IMAGE_SIDE = 2000;
const JPEG_QUALITY = 0.85;

export type PreparedDocument = { status: "ready"; file: Blob } | { status: "too_large" } | { status: "unreadable" };
export type ShrinkImage = (file: Blob, maxSide: number) => Promise<Blob>;

/** Redraws an image no larger than `maxSide` on its longest side, as a JPEG with a white background. Browser only. */
export const shrinkWithCanvas: ShrinkImage = async (file, maxSide) => {
  // from-image applies the photo's rotation now, because the rotation data is dropped with the rest.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No image"))), "image/jpeg", JPEG_QUALITY));
  } finally {
    bitmap.close();
  }
};

export async function prepareDocument(file: Blob, shrink: ShrinkImage = shrinkWithCanvas): Promise<PreparedDocument> {
  let ready = file;
  if (file.type.startsWith("image/")) {
    try {
      ready = await shrink(file, MAX_IMAGE_SIDE);
    } catch {
      return { status: "unreadable" };
    }
  }
  return ready.size > MAX_DOCUMENT_BYTES ? { status: "too_large" } : { status: "ready", file: ready };
}
