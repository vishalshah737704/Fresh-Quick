export type PaymentMethod = "mock_card" | "mock_upi" | "mock_cod";

export type CardFields = {
  cardNumber: string;
  expiry: string; // "MM/YY"
  cardholderName: string;
};

export type UpiFields = {
  upiId: string;
};

// Strips spaces/dashes before checking -- the UI formats the input as the
// user types, but validation (client AND server) must accept that
// formatted string, not just a raw 16-digit run.
function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

export function validateCardFields(fields: CardFields): string | null {
  const digits = digitsOnly(fields.cardNumber);
  if (digits.length !== 16) {
    return "Card number must be 16 digits";
  }
  const match = /^(\d{2})\/(\d{2})$/.exec(fields.expiry.trim());
  if (!match) {
    return "Expiry must be in MM/YY format";
  }
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) {
    return "Expiry month must be between 01 and 12";
  }
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return "Card has expired";
  }
  if (fields.cardholderName.trim().length === 0) {
    return "Cardholder name is required";
  }
  return null;
}

export function validateUpiFields(fields: UpiFields): string | null {
  if (!/^[\w.\-]+@[\w]+$/.test(fields.upiId.trim())) {
    return "Enter a valid UPI ID, e.g. name@bank";
  }
  return null;
}

export function buildMaskedReference(
  method: PaymentMethod,
  cardFields: CardFields,
  upiFields: UpiFields
): string {
  if (method === "mock_card") {
    const digits = digitsOnly(cardFields.cardNumber);
    return `Card •••• ${digits.slice(-4)}`;
  }
  if (method === "mock_upi") {
    return `UPI ${upiFields.upiId.trim()}`;
  }
  return "Cash on Delivery";
}

export function validateRecipientEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Enter a valid email address";
  }
  return null;
}
