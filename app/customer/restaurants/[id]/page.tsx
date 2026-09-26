import { redirect } from "next/navigation";

export default async function LegacyRestaurantRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/customer/stores/${id}`);
}
