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
import { ALREADY_PENDING_MESSAGE, ALREADY_REGISTERED_MESSAGE } from "@/lib/registration-model";

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

  let outcome;
  try {
    outcome = await runSignup(body, {
      validate: (b) => validateSignupPayload(b, normalizeIndianMobile),
      geocode: geocodeAddress,
      buildLabel: buildSavedLabel,
      messages: {
        notFound: GEOCODE_NOT_FOUND_MESSAGE,
        unavailable: GEOCODE_UNAVAILABLE_MESSAGE,
        alreadyPending: ALREADY_PENDING_MESSAGE,
        alreadyRegistered: ALREADY_REGISTERED_MESSAGE,
      },
      async lookupByEmail(email) {
        const { data, error } = await supabaseServer.rpc("registration_state_by_email", { p_email: email });
        if (error) throw new Error("lookup failed");
        const row = Array.isArray(data) ? data[0] : null;
        return row
          ? { kind: "found", userId: row.user_id, role: row.role, approvalStatus: row.approval_status }
          : { kind: "none" };
      },
      async reRegister(row) {
        // 1. Re-check the row is still rejected and capture the decision so a failure can restore it.
        const { data: current, error: readError } = await supabaseServer
          .from("users")
          .select("approval_status, rejection_reason, reviewed_at, reviewed_by")
          .eq("id", row.userId)
          .maybeSingle();
        if (readError || !current || current.approval_status !== "rejected") return "failed";

        // 2. Guarded flip FIRST: if the account is no longer rejected nothing else has changed.
        const { data: flipped, error: flipError } = await supabaseServer
          .from("users")
          .update({
            full_name: row.fullName,
            phone: row.phone,
            saved_lat: row.lat,
            saved_lng: row.lng,
            saved_label: row.label,
            approval_status: "pending",
            rejection_reason: null,
            reviewed_at: null,
            reviewed_by: null,
          })
          .eq("id", row.userId)
          .eq("approval_status", "rejected")
          .select("id");
        if (flipError || !flipped || flipped.length === 0) return "failed";

        // 3. Replace the address and password; 4. on any failure put the rejection back.
        const revert = async () => {
          await supabaseServer
            .from("users")
            .update({
              approval_status: "rejected",
              rejection_reason: current.rejection_reason,
              reviewed_at: current.reviewed_at,
              reviewed_by: current.reviewed_by,
            })
            .eq("id", row.userId)
            .eq("approval_status", "pending");
        };
        try {
          const { error: delError } = await supabaseServer.from("addresses").delete().eq("user_id", row.userId);
          if (delError) throw new Error("address delete");
          const { error: addrError } = await supabaseServer.from("addresses").insert({
            user_id: row.userId,
            label: "Home",
            line1: row.address.line1,
            line2: row.address.line2 || null,
            city: row.address.city,
            state: row.address.state,
            pincode: row.address.pincode,
            lat: row.lat,
            lng: row.lng,
            is_default: true,
          });
          if (addrError) throw new Error("address insert");
          const { error: authError } = await supabaseServer.auth.admin.updateUserById(row.userId, {
            password: row.password,
          });
          if (authError) throw new Error("password");
        } catch {
          try {
            await revert();
          } catch {
            // Best effort; the caller still gets the failure.
          }
          return "failed";
        }
        return null;
      },
      async createAuthUser(email, password) {
        const { data, error } = await supabaseServer.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          ban_duration: "876000h",
        });
        if (error || !data.user) return { error: error?.message ?? "Failed to create account" };
        newUserId = data.user.id;
        return { id: data.user.id };
      },
      async insertProfile(row) {
        const { error } = await supabaseServer.from("users").insert({
          id: row.id,
          role: "customer",
          approval_status: "pending",
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
  } catch (error) {
    console.error("signup failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
  if (outcome.status === 200 && referrerId && newUserId) {
    // The account already exists, so a failure here must not fail the sign-up.
    const { error } = await supabaseServer
      .from("referrals")
      .insert({ referrer_id: referrerId, referred_id: newUserId });
    if (error) console.error("referral link failed", error.code);
  }
  return NextResponse.json(outcome.body, { status: outcome.status });
}
