import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { validateSignupPayload } from "@/lib/signup-validation";
import { normalizeIndianMobile } from "@/lib/phone";
import { geocodeAddress } from "@/lib/geocode-server";
import {
  buildSavedLabel,
  GEOCODE_NOT_FOUND_MESSAGE,
  GEOCODE_UNAVAILABLE_MESSAGE,
} from "@/lib/geocode-parse";
import { runSignup } from "@/lib/signup-pipeline";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Optional referral code: an unknown code is rejected BEFORE any account exists.
  let referrerId: string | null = null;
  const rawReferral = typeof body.referralCode === "string" ? body.referralCode.trim() : "";
  if (rawReferral !== "") {
    const code = rawReferral.toUpperCase();
    const { data: referrer } = await supabaseServer
      .from("users")
      .select("id")
      .eq("referral_code", code)
      .eq("role", "customer")
      .maybeSingle();
    if (!referrer) {
      return NextResponse.json({ error: "That referral code does not exist." }, { status: 400 });
    }
    referrerId = referrer.id;
  }
  let newUserId = null as string | null;

  const outcome = await runSignup(body, {
    validate: (b) => validateSignupPayload(b, normalizeIndianMobile),
    geocode: geocodeAddress,
    buildLabel: buildSavedLabel,
    messages: { notFound: GEOCODE_NOT_FOUND_MESSAGE, unavailable: GEOCODE_UNAVAILABLE_MESSAGE },
    async createAuthUser(email, password) {
      const { data, error } = await supabaseServer.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) return { error: error?.message ?? "Failed to create account" };
      newUserId = data.user.id;
      return { id: data.user.id };
    },
    async insertProfile(row) {
      const { error } = await supabaseServer.from("users").insert({
        id: row.id,
        role: "customer",
        full_name: row.fullName,
        phone: row.phone,
        saved_lat: row.lat,
        saved_lng: row.lng,
        saved_label: row.label,
      });
      return error ? "failed" : null;
    },
    async insertAddress({ userId, address, lat, lng }) {
      const { error } = await supabaseServer.from("addresses").insert({
        user_id: userId,
        label: "Home",
        line1: address.line1,
        line2: address.line2 || null,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        lat,
        lng,
        is_default: true,
      });
      return error ? "failed" : null;
    },
    async deleteAuthUser(id) {
      await supabaseServer.auth.admin.deleteUser(id);
    },
  });
  if (outcome.status === 200 && referrerId && newUserId) {
    // The account already exists, so a failure here must not fail the sign-up.
    const { error } = await supabaseServer
      .from("referrals")
      .insert({ referrer_id: referrerId, referred_id: newUserId });
    if (error) console.error("referral link failed", error.code);
  }
  return NextResponse.json(outcome.body, { status: outcome.status });
}
