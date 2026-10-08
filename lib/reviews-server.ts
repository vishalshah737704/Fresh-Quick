import "server-only";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase-server";
import type { PhotoType } from "@/lib/review-photo";

export const REVIEW_BUCKET = "review-photos";

// The review id does not exist yet when the photo is uploaded, so the object lives under the order id.
export async function uploadReviewPhoto(orderId: string, bytes: Uint8Array, type: PhotoType, ext: string): Promise<string> {
  const path = `reviews/${orderId}/${randomUUID()}.${ext}`;
  const { error } = await supabaseServer.storage.from(REVIEW_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
  return path;
}

export async function deleteReviewPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabaseServer.storage.from(REVIEW_BUCKET).remove(paths);
  if (error) console.error("review photo cleanup failed", error.message);
}

// Only the admin list uses signed URLs (an <img> cannot send a bearer token); everyone else goes through
// /api/reviews/[id]/photo, which refuses hidden reviews.
export async function signReviewPhoto(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseServer.storage.from(REVIEW_BUCKET).createSignedUrl(path, 3600);
  if (error || !data) {
    console.error("review photo signing failed", error?.message);
    return null;
  }
  return data.signedUrl;
}
