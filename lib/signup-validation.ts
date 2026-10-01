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
