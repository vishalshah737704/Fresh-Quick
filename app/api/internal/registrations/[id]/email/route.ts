import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { isUuid } from "@/lib/registration-admin";
import { buildRegistrationEmail, type RegistrationEmailEvent } from "@/lib/registration-email";
import { BRAND } from "@/lib/branding";

const EVENTS: Record<string, { event: RegistrationEmailEvent; status: string }> = {
  submitted: { event: "submitted", status: "pending" },
  approved: { event: "approved", status: "approved" },
  rejected: { event: "rejected", status: "rejected" },
};

// Called by n8n workflow 11. Returns ready-made email content so the workflow only has to send it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;
  const spec = EVENTS[request.nextUrl.searchParams.get("event") ?? ""];
  if (!isUuid(id) || !spec) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data, error } = await supabaseServer.rpc("registration_email_context", { p_user_id: id });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  // A stale or replayed event (the status moved on) must not send a wrong email.
  if (row.approval_status !== spec.status) {
    return NextResponse.json({ error: "Event does not match the current status" }, { status: 409 });
  }

  let to: string = row.email;
  if (spec.event === "submitted") {
    const { data: admins, error: adminError } = await supabaseServer.rpc("registration_admin_emails");
    const list = Array.isArray(admins) ? (admins as string[]).filter(Boolean) : [];
    if (adminError || list.length === 0) {
      console.error("registration email: no admin email found");
      return NextResponse.json({ error: "No admin email" }, { status: 404 });
    }
    to = list.join(",");
  }

  const base = (process.env.APP_PUBLIC_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const address = [row.line1, row.line2, row.city, row.state, row.pincode].filter(Boolean).join(", ");
  const { subject, html } = buildRegistrationEmail({
    event: spec.event,
    brandName: BRAND.name,
    fullName: row.full_name ?? "",
    email: row.email,
    phone: row.phone ?? "",
    address,
    reason: row.rejection_reason ?? undefined,
    adminUrl: `${base}/admin/registrations`,
    loginUrl: `${base}/customer/login`,
  });
  return NextResponse.json({ to, emailSubject: subject, emailHtml: html });
}
