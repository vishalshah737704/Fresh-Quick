// Largest legitimate body: history up to 40 000 characters plus a 50-line cart snapshot.
export const MAX_BODY_BYTES = 200_000;

export function declaredLengthTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) return false;
  const text = contentLength.trim();
  if (!/^\d+$/.test(text)) return false;
  return Number(text) > MAX_BODY_BYTES;
}
