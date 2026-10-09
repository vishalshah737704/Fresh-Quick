import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { guardProfile } from "@/lib/registration-guard";
import { parseSavedLocation } from "@/lib/saved-location";

async function resolveCustomerId(
  request: NextRequest
): Promise<{ userId: string } | { error: string; status: number }> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: "Missing Authorization header", status: 401 };
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: "Invalid or expired session", status: 401 };
  }
  const { data: profile, error: profileError } = await supabaseServer
    .from("users")
    .select("role, approval_status")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) {
    return { error: "Failed to verify account", status: 500 };
  }
  if (!profile || profile.role !== "customer") {
    return { error: "Customers only", status: 403 };
  }
  if (!guardProfile(profile).ok) {
    return { error: "Your registration has not been approved", status: 403 };
  }
  return { userId: userData.user.id };
}

export async function GET(request: NextRequest) {
  const resolved = await resolveCustomerId(request);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("users")
    .select("saved_lat, saved_lng, saved_label")
    .eq("id", resolved.userId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load location" }, { status: 500 });
  }
  if (!data || data.saved_lat === null || data.saved_lng === null || data.saved_label === null) {
    return NextResponse.json({ location: null });
  }
  return NextResponse.json({
    location: { lat: Number(data.saved_lat), lng: Number(data.saved_lng), label: data.saved_label },
  });
}

export async function PUT(request: NextRequest) {
  const resolved = await resolveCustomerId(request);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const body = await request.json().catch(() => null);
  const parsed = parseSavedLocation(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { error } = await supabaseServer
    .from("users")
    .update({
      saved_lat: parsed.value.lat,
      saved_lng: parsed.value.lng,
      saved_label: parsed.value.label,
    })
    .eq("id", resolved.userId);
  if (error) {
    return NextResponse.json({ error: "Failed to save location" }, { status: 500 });
  }
  return NextResponse.json({ location: parsed.value });
}

export async function DELETE(request: NextRequest) {
  const resolved = await resolveCustomerId(request);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { error } = await supabaseServer
    .from("users")
    .update({ saved_lat: null, saved_lng: null, saved_label: null })
    .eq("id", resolved.userId);
  if (error) {
    return NextResponse.json({ error: "Failed to clear location" }, { status: 500 });
  }
  return NextResponse.json({ location: null });
}
