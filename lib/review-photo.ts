// Pure checks for review photos. Imports nothing at runtime so `node --test` can load it.
// The limits here mirror REVIEW_LIMITS.photoBytes / REVIEW_PHOTO_TYPES in lib/reviews-model.ts.
export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const EXT: Record<PhotoType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
}

// The declared type comes from the client, so the bytes decide.
export function sniffImageType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && pngSignature.every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function checkPhoto(input: {
  size: number;
  declaredType: string;
  bytes: Uint8Array;
}): { ok: true; type: PhotoType; ext: string } | { ok: false; error: string } {
  if (input.size <= 0) return { ok: false, error: "The photo is empty" };
  if (input.size > MAX_PHOTO_BYTES) return { ok: false, error: "The photo must be 3 MB or smaller" };
  const sniffed = sniffImageType(input.bytes);
  if (!sniffed) return { ok: false, error: "The photo must be a JPEG, PNG or WebP image" };
  if (input.declaredType !== sniffed) return { ok: false, error: "The photo type does not match its contents" };
  return { ok: true, type: sniffed, ext: EXT[sniffed] };
}
