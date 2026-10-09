// Shapes registration rows for the admin API with an allow-list (never a row spread).
export type RegistrationRow = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  line1: string | null;
  city: string | null;
  pincode: string | null;
  createdAt: string | null;
  status: string;
  reason: string | null;
  reviewedAt: string | null;
};

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

export function shapeRegistrationRows(rows: unknown): RegistrationRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      id: String(row.user_id ?? ""),
      email: String(row.email ?? ""),
      fullName: str(row.full_name),
      phone: str(row.phone),
      line1: str(row.line1),
      city: str(row.city),
      pincode: str(row.pincode),
      createdAt: str(row.created_at),
      status: String(row.approval_status ?? ""),
      reason: str(row.rejection_reason),
      reviewedAt: str(row.reviewed_at),
    };
  });
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
