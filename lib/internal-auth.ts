import "server-only";
import { createHash, timingSafeEqual } from "crypto";

// Guards /api/internal/* routes, which are meant to be called only by n8n
// (or a developer testing the n8n integration), never by a browser client.
// Verifies a shared secret header rather than a user session — there is no
// end-user identity on these calls.
export function verifyInternalSecret(request: Request): boolean {
  const provided = request.headers.get("x-internal-secret");
  const expected = process.env.N8N_INTERNAL_SECRET;
  if (!expected || provided === null) {
    return false;
  }
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}
