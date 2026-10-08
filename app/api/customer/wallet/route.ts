import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";
import { REFERRAL_MAX_REWARDS, REFERRAL_REWARD_PAISE, type WalletEntry } from "@/lib/coupon-model";

export async function GET(request: NextRequest) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });

  const [balance, code, ledger, referred] = await Promise.all([
    supabaseServer.rpc("wallet_balance_paise", { p_customer: who.userId }),
    supabaseServer.rpc("ensure_referral_code", { p_customer: who.userId }),
    supabaseServer
      .from("wallet_ledger")
      .select("id, amount_paise, kind, note, created_at")
      .eq("customer_id", who.userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseServer.from("referrals").select("status").eq("referrer_id", who.userId),
  ]);
  if (balance.error || code.error || ledger.error || referred.error) {
    return NextResponse.json({ error: "Failed to load wallet" }, { status: 500 });
  }
  const entries: WalletEntry[] = (ledger.data ?? []).map((row) => ({
    id: row.id,
    amountPaise: row.amount_paise,
    kind: row.kind,
    note: row.note,
    createdAt: row.created_at,
  }));
  const rows = referred.data ?? [];
  return NextResponse.json({
    balancePaise: balance.data as number,
    referralCode: code.data as string,
    referralRewardPaise: REFERRAL_REWARD_PAISE,
    referralMaxRewards: REFERRAL_MAX_REWARDS,
    referredCount: rows.length,
    creditedCount: rows.filter((r) => r.status === "credited").length,
    entries,
  });
}
