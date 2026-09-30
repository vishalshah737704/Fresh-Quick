// Indian mobile: optional +91 / 91 / 0 prefix, then 10 digits starting 6-9.
// Keep mobile/lib/phone.ts byte-identical (tests/phone.test.mjs enforces it).
export function normalizeIndianMobile(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, "");
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact);
  return match ? `+91${match[1]}` : null;
}

export function validateRecipientPhone(input: string): string | null {
  return normalizeIndianMobile(input) ? null : "Enter a valid 10-digit Indian mobile number";
}
