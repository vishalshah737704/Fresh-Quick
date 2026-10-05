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
  return NextResponse.json(outcome.body, { status: outcome.status });
}
