export function mapCreateReviewError(error: { code?: string; message?: string }): { status: number; error: string } {
  switch (error.message) {
    case "review_order_not_found":
      return { status: 404, error: "not found" };
    case "review_not_delivered":
      return { status: 409, error: "You can review an order once it has been delivered" };
    case "review_dish_not_in_order":
      return { status: 400, error: "A rated dish is not part of this order" };
    case "review_no_partner":
      return { status: 400, error: "This order has no delivery partner to rate" };
  }
  if (error.code === "23505") return { status: 409, error: "You have already reviewed this order" };
  return { status: 500, error: "Could not save your review right now" };
}
