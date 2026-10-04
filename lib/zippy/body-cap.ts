// Largest legitimate body: history up to 40 000 characters plus a 50-line cart snapshot.
export const MAX_BODY_BYTES = 200_000;

type ByteReader = { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<unknown> | unknown };
type ByteStream = { getReader(): ByteReader };

// Reads a body chunk by chunk and gives up (cancelling the stream) as soon as the running total passes
// the cap, so a chunked upload with no content-length is never buffered whole.
export async function readTextWithCap(
  stream: ByteStream | null,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false }> {
  if (!stream) return { ok: true, text: "" };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(all) };
}

export function declaredLengthTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) return false;
  const text = contentLength.trim();
  if (!/^\d+$/.test(text)) return false;
  return Number(text) > MAX_BODY_BYTES;
}
