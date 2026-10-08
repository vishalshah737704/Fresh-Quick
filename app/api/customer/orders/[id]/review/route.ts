import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import {
  REVIEW_SELECT,
  partnerScore,
  reviewPhotoPath,
  toOwnReview,
  validateReviewPayload,
  type OrderReviewState,
  type RawReviewRow,
} from "@/lib/reviews-model";
import { checkPhoto } from "@/lib/review-photo";
import { deleteReviewPhotos, uploadReviewPhoto } from "@/lib/reviews-server";
import { mapCreateReviewError } from "@/lib/review-errors";

type Ctx = { params: Promise<{ id: string }> };

type OrderRow = {
  id: string;
  status: string;
  delivery_partner_id: string | null;
  order_items: { product_id: string; products: { name: string } | { name: string }[] | null }[];
};

// Filtering on the verified customer id makes another customer's order simply "not found".
async function loadOrder(orderId: string, customerId: string): Promise<OrderRow | null | "error"> {
  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, status, delivery_partner_id, order_items(product_id, products(name))")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) return "error";
  return (data as unknown as OrderRow | null) ?? null;
}

function distinctDishes(order: OrderRow): { productId: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const line of order.order_items) {
    if (byId.has(line.product_id)) continue;
    const product = Array.isArray(line.products) ? line.products[0] : line.products;
    byId.set(line.product_id, product?.name ?? "Dish");
  }
  return [...byId].map(([productId, name]) => ({ productId, name }));
}

async function loadReview(orderId: string): Promise<RawReviewRow | null | "error"> {
  const { data, error } = await supabaseServer.from("reviews").select(REVIEW_SELECT).eq("order_id", orderId).maybeSingle();
  if (error) {
    console.error("review load failed", error.message);
    return "error";
  }
  return (data as unknown as RawReviewRow | null) ?? null;
}

// A hidden review's photo is not served by the proxy, so do not hand out a URL that would 404.
function ownPhotoUrl(review: RawReviewRow): string | null {
  return review.photo_path && review.status === "visible" ? reviewPhotoPath(review.id) : null;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });
  const order = await loadOrder(id.toLowerCase(), who.userId);
  if (order === "error") return NextResponse.json({ error: "Failed to load review" }, { status: 500 });
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  const review = await loadReview(order.id);
  if (review === "error") return NextResponse.json({ error: "Failed to load review" }, { status: 500 });
  let score: OrderReviewState["partnerScore"] = null;
  if (order.delivery_partner_id) {
    const { data: partner } = await supabaseServer
      .from("delivery_partners")
      .select("rating_sum, rating_count")
      .eq("user_id", order.delivery_partner_id)
      .maybeSingle();
    score = partnerScore(partner?.rating_sum ?? 0, partner?.rating_count ?? 0);
  }
  const eligible = order.status === "delivered" && !review;
  const state: OrderReviewState = {
    eligible,
    dishes: eligible ? distinctDishes(order) : [],
    hasPartner: order.delivery_partner_id !== null,
    review: review ? toOwnReview(review, ownPhotoUrl(review)) : null,
    partnerScore: score,
  };
  return NextResponse.json(state);
}

async function readSubmission(request: NextRequest): Promise<{ raw: unknown; photo: File | null } | { error: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      // NextRequest's formData() is typed with a FormData that lacks get() in this toolchain; the runtime object is the standard one.
      const form = (await request.formData()) as unknown as globalThis.FormData;
      const payload = form.get("payload");
      if (typeof payload !== "string") return { error: "Missing review" };
      const photo = form.get("photo");
      return { raw: JSON.parse(payload), photo: photo instanceof File ? photo : null };
    }
    return { raw: await request.json(), photo: null };
  } catch {
    return { error: "Invalid request body" };
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });
  const orderId = id.toLowerCase();

  const order = await loadOrder(orderId, who.userId);
  if (order === "error") return NextResponse.json({ error: "Could not save your review right now" }, { status: 500 });
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (order.status !== "delivered") {
    return NextResponse.json({ error: "You can review an order once it has been delivered" }, { status: 409 });
  }
  const existing = await loadReview(orderId);
  if (existing === "error") return NextResponse.json({ error: "Could not save your review right now" }, { status: 500 });
  if (existing) return NextResponse.json({ error: "You have already reviewed this order" }, { status: 409 });

  const submission = await readSubmission(request);
  if ("error" in submission) return NextResponse.json({ error: submission.error }, { status: 400 });
  const parsed = validateReviewPayload(submission.raw, {
    orderProductIds: distinctDishes(order).map((dish) => dish.productId),
    hasPartner: order.delivery_partner_id !== null,
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;

  let photoPath: string | null = null;
  if (submission.photo) {
    const bytes = new Uint8Array(await submission.photo.arrayBuffer());
    const checked = checkPhoto({ size: bytes.length, declaredType: submission.photo.type, bytes });
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    try {
      photoPath = await uploadReviewPhoto(orderId, bytes, checked.type, checked.ext);
    } catch (err) {
      console.error("review photo upload failed", err);
      return NextResponse.json({ error: "Could not upload the photo right now" }, { status: 500 });
    }
  }

  const { data: reviewId, error } = await supabaseServer.rpc("create_review", {
    p_order_id: orderId,
    p_customer_id: who.userId,
    p_store_stars: input.storeStars,
    p_store_comment: input.storeComment,
    p_photo_path: photoPath,
    p_dishes: input.dishes.map((dish) => ({ product_id: dish.productId, stars: dish.stars, comment: dish.comment })),
    p_partner_stars: input.partner?.stars ?? null,
    p_partner_comment: input.partner?.comment ?? null,
  });
  if (error || typeof reviewId !== "string") {
    if (photoPath) await deleteReviewPhotos([photoPath]);
    const failure = mapCreateReviewError(error ?? {});
    if (failure.status === 500) console.error("create_review failed", error?.message);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  const loaded = await loadReview(orderId);
  const review = loaded === "error" ? null : loaded;
  return NextResponse.json(
    { review: review ? toOwnReview(review, ownPhotoUrl(review)) : null },
    { status: 201 }
  );
}
