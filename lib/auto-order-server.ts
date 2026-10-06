import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  AUTO_ORDER_KEY,
  OPEN_AUTO_STATUSES,
  parseAutoOrderSetting,
  type AutoStepDeps,
} from "@/lib/auto-order";

type PaymentRow = { status: string };

function paymentRows(value: PaymentRow[] | PaymentRow | null | undefined): PaymentRow[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

export async function getAutoOrderEnabled(): Promise<boolean> {
  const { data } = await supabaseServer
    .from("app_settings")
    .select("value")
    .eq("key", AUTO_ORDER_KEY)
    .maybeSingle();
  return parseAutoOrderSetting(data?.value);
}

export async function setAutoOrderEnabled(enabled: boolean): Promise<boolean> {
  const { error } = await supabaseServer
    .from("app_settings")
    .upsert({ key: AUTO_ORDER_KEY, value: { enabled }, updated_at: new Date().toISOString() });
  return !error;
}

export const autoStepDeps: AutoStepDeps = {
  readEnabled: getAutoOrderEnabled,
  async readOrder(id) {
    const { data } = await supabaseServer
      .from("orders")
      .select("status, payments(status)")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const payments = paymentRows(data.payments as PaymentRow[] | PaymentRow | null);
    return { status: data.status, paymentSucceeded: payments.some((p) => p.status === "success") };
  },
  async advance(id, from, to) {
    const { data, error } = await supabaseServer
      .from("orders")
      .update({ status: to })
      .eq("id", id)
      .eq("status", from)
      .select("id");
    return !error && (data?.length ?? 0) === 1;
  },
  async retriggerAssignment(id) {
    // Writing the same status still fires the "after update of status" trigger, which restarts workflow 04.
    const { data, error } = await supabaseServer
      .from("orders")
      .update({ status: "ready" })
      .eq("id", id)
      .eq("status", "ready")
      .is("delivery_partner_id", null)
      .select("id");
    return !error && (data?.length ?? 0) === 1;
  },
};

export async function listOpenAutoOrders(): Promise<{ id: string; status: string }[]> {
  if (!(await getAutoOrderEnabled())) return [];
  const { data } = await supabaseServer
    .from("orders")
    .select("id, status, payments(status)")
    .in("status", [...OPEN_AUTO_STATUSES]);
  const rows = (data ?? []) as {
    id: string;
    status: string;
    payments: PaymentRow[] | PaymentRow | null;
  }[];
  return rows
    .filter((row) => row.status !== "placed" || paymentRows(row.payments).some((p) => p.status === "success"))
    .map((row) => ({ id: row.id, status: row.status }));
}
