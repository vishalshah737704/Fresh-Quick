import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const { email, password, fullName } = await request.json();

  if (!email || !password || !fullName) {
    return NextResponse.json(
      { error: "email, password, and fullName are required" },
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
    .insert({ id: created.user.id, role: "customer", full_name: fullName });

  if (profileError) {
    // Roll back the auth user so a half-created account can't linger.
    await supabaseServer.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
