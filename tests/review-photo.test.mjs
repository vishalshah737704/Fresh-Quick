import test from "node:test";
import assert from "node:assert/strict";
import { sniffImageType, checkPhoto } from "../lib/review-photo.ts";
import { REVIEW_LIMITS } from "../lib/reviews-model.ts";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const text = new TextEncoder().encode("hello, I am not an image");

test("sniffImageType recognises JPEG, PNG and WebP and nothing else", () => {
  assert.equal(sniffImageType(jpeg), "image/jpeg");
  assert.equal(sniffImageType(png), "image/png");
  assert.equal(sniffImageType(webp), "image/webp");
  assert.equal(sniffImageType(text), null);
  assert.equal(sniffImageType(new Uint8Array([])), null);
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8])), null);
  assert.equal(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45])), null); // RIFF/WAVE
});

test("checkPhoto accepts a matching declared type", () => {
  assert.deepEqual(checkPhoto({ size: jpeg.length, declaredType: "image/jpeg", bytes: jpeg }), { ok: true, type: "image/jpeg", ext: "jpg" });
  assert.deepEqual(checkPhoto({ size: png.length, declaredType: "image/png", bytes: png }), { ok: true, type: "image/png", ext: "png" });
  assert.deepEqual(checkPhoto({ size: webp.length, declaredType: "image/webp", bytes: webp }), { ok: true, type: "image/webp", ext: "webp" });
});

test("checkPhoto refuses empty, oversize, mislabelled and non-image files", () => {
  assert.equal(checkPhoto({ size: 0, declaredType: "image/jpeg", bytes: new Uint8Array([]) }).ok, false);
  assert.equal(checkPhoto({ size: REVIEW_LIMITS.photoBytes + 1, declaredType: "image/jpeg", bytes: jpeg }).ok, false);
  assert.equal(checkPhoto({ size: REVIEW_LIMITS.photoBytes, declaredType: "image/jpeg", bytes: jpeg }).ok, true);
  assert.equal(checkPhoto({ size: png.length, declaredType: "image/jpeg", bytes: png }).ok, false); // PNG bytes labelled JPEG
  assert.equal(checkPhoto({ size: text.length, declaredType: "image/jpeg", bytes: text }).ok, false); // text named .jpg
  assert.equal(checkPhoto({ size: jpeg.length, declaredType: "image/gif", bytes: jpeg }).ok, false);
  assert.equal(checkPhoto({ size: jpeg.length, declaredType: "", bytes: jpeg }).ok, false);
});
