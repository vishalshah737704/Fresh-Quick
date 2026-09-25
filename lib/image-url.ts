// Allowed remote image hosts, kept in sync with next.config.ts's
// images.remotePatterns. next/image throws a hard runtime error on the
// customer-facing pages if an unconfigured hostname is used, so vendor-
// supplied image URLs must be validated against this list before storage.
const ALLOWED_IMAGE_HOSTS = ["images.pexels.com"];

export function isAllowedImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.includes(url.hostname);
}
