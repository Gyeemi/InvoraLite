export type BusinessBrandKind = "logo" | "letterhead";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

const BRAND_LIMITS: Record<
  BusinessBrandKind,
  { maxWidth: number; maxHeight: number; label: string }
> = {
  logo: { maxWidth: 480, maxHeight: 480, label: "Logo" },
  letterhead: { maxWidth: 1400, maxHeight: 420, label: "Letterhead" },
};

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read image."));
    image.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image."));
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

/** Compresses and resizes an uploaded brand image for storage / print. */
export async function fileToBusinessBrandDataUrl(
  file: File,
  kind: BusinessBrandKind,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (PNG, JPG, or WebP).");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`${BRAND_LIMITS[kind].label} image must be 5 MB or smaller.`);
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const { maxWidth, maxHeight } = BRAND_LIMITS[kind];
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not process image.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  // Prefer PNG for logos with transparency; JPEG for wide letterheads.
  if (kind === "logo" && file.type === "image/png") {
    return canvas.toDataURL("image/png");
  }
  return canvas.toDataURL("image/jpeg", 0.88);
}
