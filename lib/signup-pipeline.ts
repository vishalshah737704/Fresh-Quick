import type { GeocodeAddress, GeocodeResult } from "./geocode-parse";
import type { SignupPayload } from "./signup-validation";

// Pure, dependency-injected sign-up pipeline so every failure path is testable under node's test runner.
// The route supplies the real validator, geocoder and Supabase calls.
export type SignupDeps = {
  validate(body: Record<string, unknown>):
    | { ok: true; value: SignupPayload }
    | { ok: false; error: string };
  geocode(address: GeocodeAddress): Promise<GeocodeResult>;
  buildLabel(address: GeocodeAddress): string;
  messages: { notFound: string; unavailable: string };
  createAuthUser(email: string, password: string): Promise<{ id: string } | { error: string }>;
  insertProfile(row: {
    id: string;
    fullName: string;
    phone: string;
    lat: number;
    lng: number;
    label: string;
  }): Promise<string | null>;
  insertAddress(row: {
    userId: string;
    address: GeocodeAddress;
    lat: number;
    lng: number;
  }): Promise<string | null>;
  deleteAuthUser(id: string): Promise<void>;
};

export type SignupOutcome = { status: number; body: { ok: true } | { error: string } };

export async function runSignup(
  body: Record<string, unknown>,
  deps: SignupDeps
): Promise<SignupOutcome> {
  const parsed = deps.validate(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const { email, password, fullName, phone, address } = parsed.value;

  // Geocode BEFORE creating anything, so a bad address or a provider outage leaves no account behind.
  const geo = await deps.geocode(address);
  if (geo.kind === "not_found") return { status: 400, body: { error: deps.messages.notFound } };
  if (geo.kind === "unavailable") {
    return { status: 503, body: { error: deps.messages.unavailable } };
  }

  const created = await deps.createAuthUser(email, password);
  if ("error" in created) return { status: 400, body: { error: created.error } };

  try {
    const profileError = await deps.insertProfile({
      id: created.id,
      fullName,
      phone,
      lat: geo.lat,
      lng: geo.lng,
      label: deps.buildLabel(address),
    });
    if (profileError) throw new Error("profile");
    const addressError = await deps.insertAddress({
      userId: created.id,
      address,
      lat: geo.lat,
      lng: geo.lng,
    });
    if (addressError) throw new Error("address");
  } catch {
    // Deleting the auth user cascades users/addresses.
    try {
      await deps.deleteAuthUser(created.id);
    } catch {
      // Nothing more to do; surfaced as the 500 below.
    }
    return { status: 500, body: { error: "Failed to create account" } };
  }
  return { status: 200, body: { ok: true } };
}
