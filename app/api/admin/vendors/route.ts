import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { validateSignupFields } from "@/lib/signup-validation";

export async function POST(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { email, password, fullName, storeName, lat, lng } = body ?? {};

  const validationError = validateSignupFields(body, [
    "email",
    "password",
    "fullName",
    "storeName",
  ]);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  if (
    typeof lat !== "number" || !Number.isFinite(lat) ||
    typeof lng !== "number" || !Number.isFinite(lng)
  ) {
    return NextResponse.json({ error: "Invalid store location" }, { status: 400 });
  }

  const { data: created, error: createError } =
    await supabaseServer.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Failed to create account" },
      { status: 400 }
    );
  }

  const { error: profileError } = await supabaseServer
    .from("users")
    .insert({ id: created.user.id, role: "vendor", full_name: fullName });

  if (profileError) {
    await supabaseServer.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: storeError } = await supabaseServer
    .from("stores")
    .insert({
      owner_id: created.user.id,
      name: storeName,
      cuisine_tags: [],
      lat,
      lng,
      is_open: true,
      category_type: "restaurant",
    });

  if (storeError) {
    await supabaseServer.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: storeError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
