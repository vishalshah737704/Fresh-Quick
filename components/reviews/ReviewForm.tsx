"use client";

import { useState } from "react";
import { StarInput } from "@/components/reviews/Stars";
import {
  REVIEW_LIMITS,
  REVIEW_PHOTO_TYPES,
  type OrderReviewState,
  type ReviewInput,
} from "@/lib/reviews-model";

export function ReviewForm({
  state,
  submitting,
  error,
  onSubmit,
}: {
  state: OrderReviewState;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: ReviewInput, photo: File | null) => Promise<boolean>;
}) {
  const [storeStars, setStoreStars] = useState(0);
  const [storeComment, setStoreComment] = useState("");
  const [dishStars, setDishStars] = useState<Record<string, number>>({});
  const [dishComments, setDishComments] = useState<Record<string, string>>({});
  const [partnerStars, setPartnerStars] = useState(0);
  const [partnerComment, setPartnerComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  function pickPhoto(file: File | null) {
    setLocalError(null);
    if (file && !(REVIEW_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setLocalError("The photo must be a JPEG, PNG or WebP image");
      return;
    }
    if (file && file.size > REVIEW_LIMITS.photoBytes) {
      setLocalError("The photo must be 3 MB or smaller");
      return;
    }
    setPhoto(file);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (storeStars === 0) {
      setLocalError("Rate the store from 1 to 5 stars");
      return;
    }
    setLocalError(null);
    await onSubmit(
      {
        storeStars,
        storeComment: storeComment.trim() || null,
        dishes: state.dishes
          .filter((dish) => (dishStars[dish.productId] ?? 0) > 0)
          .map((dish) => ({
            productId: dish.productId,
            stars: dishStars[dish.productId],
            comment: (dishComments[dish.productId] ?? "").trim() || null,
          })),
        partner: partnerStars > 0 ? { stars: partnerStars, comment: partnerComment.trim() || null } : null,
      },
      photo
    );
  }

  const shownError = localError ?? error;
  const field = "w-full rounded-[var(--radius-card)] border border-brand-ink-muted/30 bg-brand-surface p-2 text-sm";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow">
      <h2 className="font-heading text-lg text-brand-ink">Rate your order</h2>

      <div className="flex flex-col gap-2">
        <span className="font-semibold text-brand-ink">The store</span>
        <StarInput label="Store rating" value={storeStars} onChange={setStoreStars} />
        <textarea
          className={field}
          rows={3}
          maxLength={REVIEW_LIMITS.storeComment}
          placeholder="Tell others about the food and the packaging (optional)"
          value={storeComment}
          onChange={(event) => setStoreComment(event.target.value)}
        />
        <label className="text-sm text-brand-ink-muted">
          Photo (optional, JPEG, PNG or WebP, up to 3 MB)
          <input
            type="file"
            accept={REVIEW_PHOTO_TYPES.join(",")}
            className="mt-1 block text-sm"
            onChange={(event) => pickPhoto(event.target.files?.[0] ?? null)}
          />
        </label>
        {photo && (
          <p className="text-sm text-brand-ink-muted">
            {photo.name} ({Math.max(1, Math.round(photo.size / 1024))} KB){" "}
            <button type="button" className="underline" onClick={() => setPhoto(null)}>
              Remove
            </button>
          </p>
        )}
      </div>

      {state.dishes.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="font-semibold text-brand-ink">The dishes (optional)</span>
          {state.dishes.map((dish) => (
            <div key={dish.productId} className="flex flex-col gap-1">
              <span className="text-sm text-brand-ink">{dish.name}</span>
              <StarInput
                label={`Rating for ${dish.name}`}
                value={dishStars[dish.productId] ?? 0}
                onChange={(stars) => setDishStars((prev) => ({ ...prev, [dish.productId]: stars }))}
              />
              {(dishStars[dish.productId] ?? 0) > 0 && (
                <input
                  className={field}
                  maxLength={REVIEW_LIMITS.dishComment}
                  placeholder="A word about this dish (optional)"
                  value={dishComments[dish.productId] ?? ""}
                  onChange={(event) => setDishComments((prev) => ({ ...prev, [dish.productId]: event.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {state.hasPartner && (
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-brand-ink">The delivery (optional)</span>
          <span className="text-sm text-brand-ink-muted">
            How was the delivery? Rate the rider&apos;s handling and courtesy, not the restaurant&apos;s wait.
          </span>
          <StarInput label="Delivery partner rating" value={partnerStars} onChange={setPartnerStars} />
          {partnerStars > 0 && (
            <input
              className={field}
              maxLength={REVIEW_LIMITS.partnerComment}
              placeholder="A word about the delivery (optional)"
              value={partnerComment}
              onChange={(event) => setPartnerComment(event.target.value)}
            />
          )}
        </div>
      )}

      {shownError && (
        <p role="alert" className="text-sm text-brand-danger-text-safe">
          {shownError}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-[var(--radius-pill)] bg-brand-primary-text-safe px-5 py-2 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Submit review"}
      </button>
    </form>
  );
}
