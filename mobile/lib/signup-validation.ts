export const VEHICLE_TYPES = ["bike", "scooter", "bicycle", "car"] as const;

// GoTrue's admin createUser skips the minimum_password_length that signUp enforces,
// so every createUser route must check it itself. Keep in sync with supabase/config.toml.
export const MIN_PASSWORD_LENGTH = 6;

export function isValidVehicleType(v: unknown): v is (typeof VEHICLE_TYPES)[number] {
  return typeof v === "string" && (VEHICLE_TYPES as readonly string[]).includes(v);
}

export function validateSignupFields(
  body: Record<string, unknown>,
  required: string[]
): string | null {
  for (const field of required) {
    const value = body[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      return `${field} is required`;
    }
    if (value.length > 200) {
      return `${field} must be under 200 characters`;
    }
    if (field === "password" && value.length < MIN_PASSWORD_LENGTH) {
      return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
  }
  return null;
}

export type SignupAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
};

export type SignupAddressResult =
  | { ok: true; value: SignupAddress }
  | { ok: false; error: string };

export function validateSignupAddress(raw: unknown): SignupAddressResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "address is required" };
  }
  const o = raw as Record<string, unknown>;
  const value: SignupAddress = { line1: "", line2: "", city: "", state: "", pincode: "" };
  const labels = { line1: "Address line 1", city: "City", state: "State", pincode: "Pincode" } as const;
  for (const field of ["line1", "city", "state", "pincode"] as const) {
    const v = o[field];
    if (typeof v !== "string" || v.trim().length === 0) {
      return { ok: false, error: `${labels[field]} is required` };
    }
    if (v.trim().length > 200) {
      return { ok: false, error: `${labels[field]} must be under 200 characters` };
    }
    value[field] = v.trim();
  }
  const line2 = o.line2;
  if (line2 !== undefined && line2 !== null) {
    if (typeof line2 !== "string") return { ok: false, error: "Address line 2 must be text" };
    if (line2.trim().length > 200) {
      return { ok: false, error: "Address line 2 must be under 200 characters" };
    }
    value.line2 = line2.trim();
  }
  if (!/^\d{6}$/.test(value.pincode)) {
    return { ok: false, error: "Pincode must be 6 digits" };
  }
  return { ok: true, value };
}

export type SignupPayload = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  address: SignupAddress;
};

// normalizePhone is injected (lib/phone.ts normalizeIndianMobile) because lib files cannot value-import
// each other under node's test runner.
export function validateSignupPayload(
  body: Record<string, unknown>,
  normalizePhone: (input: string) => string | null
): { ok: true; value: SignupPayload } | { ok: false; error: string } {
  const fieldError = validateSignupFields(body, ["email", "password", "fullName", "phone"]);
  if (fieldError) return { ok: false, error: fieldError };
  const phone = normalizePhone(body.phone as string);
  if (!phone) return { ok: false, error: "Enter a valid 10-digit Indian mobile number" };
  const address = validateSignupAddress(body.address);
  if (!address.ok) return address;
  return {
    ok: true,
    value: {
      email: body.email as string,
      password: body.password as string,
      fullName: body.fullName as string,
      phone,
      address: address.value,
    },
  };
}
