import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { validateSignupFields } from "@/lib/signup-validation";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password, fullName, restaurantName, cuisineTags, lat, lng } = body;

  const validationError = validateSignupFields(body, [
    "email",
    "password",
    "fullName",
    "restaurantName",
  ]);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  if (
    typeof lat !== "number" || !Number.isFinite(lat) ||
    typeof lng !== "number" || !Number.isFinite(lng)
  ) {
    return NextResponse.json({ error: "Invalid restaurant location" }, { status: 400 });
  }
  const tags: string[] = Array.isArray(cuisineTags) ? cuisineTags : [];

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

  const { error: restaurantError } = await supabaseServer
    .from("restaurants")
    .insert({
      owner_id: created.user.id,
      name: restaurantName,
      cuisine_tags: tags,
      lat,
      lng,
      is_open: false,
    });

  if (restaurantError) {
    await supabaseServer.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: restaurantError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
