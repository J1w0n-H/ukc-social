// Downscale an image File to <=max px on its longest side, re-encode as JPEG q0.85.
// Browser-only (uses createImageBitmap + canvas). Pure: no React, no upload.
export async function downscale(file: File, max = 512): Promise<Blob> {
  const bitmap = await decode(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return toJpeg(canvas);
}

// How the cropper is positioned: the image's top-left corner in viewport pixels,
// plus a zoom where 1 is the smallest size that still fills the square.
export type CropView = { offsetX: number; offsetY: number; zoom: number };

type Size = { width: number; height: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// Screen pixels per source pixel at zoom 1: the short side exactly spans the
// square, which is what CSS `center/cover` does to the avatar anyway.
export function coverScale(natural: Size, viewport: number): number {
  return viewport / Math.min(natural.width, natural.height);
}

// Keep the square covered. Dragging past an edge would otherwise show a gap
// that the saved crop cannot reproduce, so the preview would be a lie.
export function clampOffset(natural: Size, viewport: number, view: CropView): { offsetX: number; offsetY: number } {
  const scale = coverScale(natural, viewport) * view.zoom;
  return {
    offsetX: clamp(view.offsetX, viewport - natural.width * scale, 0),
    offsetY: clamp(view.offsetY, viewport - natural.height * scale, 0),
  };
}

// The square of the source image the viewport is showing, in source pixels.
// Split out from the canvas work so the geometry is testable: get this wrong
// and every face quietly saves off-centre.
export function cropRect(natural: Size, viewport: number, view: CropView): { x: number; y: number; size: number } {
  const scale = coverScale(natural, viewport) * view.zoom;
  const { offsetX, offsetY } = clampOffset(natural, viewport, view);
  return { x: -offsetX / scale, y: -offsetY / scale, size: viewport / scale };
}

// The visible square, re-encoded at `out` px. Same output contract as
// downscale, so the upload path does not change.
export async function cropToSquare(
  file: File,
  viewport: number,
  view: CropView,
  out = 512,
): Promise<Blob> {
  const bitmap = await decode(file);
  const { x, y, size } = cropRect(bitmap, viewport, view);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, x, y, size, size, 0, 0, out, out);
  bitmap.close();
  return toJpeg(canvas);
}

// Dimensions as the crop will see them, EXIF rotation already applied. Read
// this rather than an <img> onLoad: a blob: URL can finish decoding before
// React attaches the handler, and the event is then simply never delivered.
export async function naturalSize(file: File): Promise<Size> {
  const bitmap = await decode(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

// Phone photos carry an EXIF rotation. An <img> tag always applies it, canvas
// historically did not, so a portrait shot previewed upright and saved
// sideways. Asking for it explicitly makes the two agree.
function decode(file: File) {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.85,
    );
  });
}
