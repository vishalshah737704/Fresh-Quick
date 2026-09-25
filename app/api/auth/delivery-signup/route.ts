import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { validateSignupFields, isValidVehicleType } from "@/lib/signup-validation";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password, fullName, vehicleType } = body;

  const validationError = validateSignupFields(body, ["email", "password", "fullName"]);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  if (vehicleType !== undefined && vehicleType !== null && !isValidVehicleType(vehicleType)) {
    return NextResponse.json(
      { error: "vehicleType must be one of: bike, scooter, bicycle, car" },
      { status: 400 }
    );
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
    .insert({ id: created.user.id, role: "delivery", full_name: fullName });

  if (profileError) {
    await supabaseServer.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: partnerError } = await supabaseServer
    .from("delivery_partners")
    .insert({
      user_id: created.user.id,
      is_online: false,
      vehicle_type: typeof vehicleType === "string" ? vehicleType : null,
    });

  if (partnerError) {
    await supabaseServer.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: partnerError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
