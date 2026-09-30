import Image from "next/image";
import { isAllowedImageUrl } from "@/lib/image-url";

// next/image throws on hosts missing from next.config remotePatterns, so
// anything not on the allowlist (or missing) gets a placeholder block.
export function ItemThumb({
  url,
  name,
  size = 56,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  if (url && isAllowedImageUrl(url)) {
    return (
      <Image
        src={url}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-[var(--radius-card)] object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[var(--radius-card)] bg-brand-accent/10"
    />
  );
}
