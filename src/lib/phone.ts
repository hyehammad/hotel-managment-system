/**
 * Canonicalizes phone numbers to standard ITU-T E.164-compatible format (+<country><national>).
 * Strictly validates format and rejects malformed, incomplete, or ambiguous inputs.
 *
 * Supported formats:
 * - Pakistani National mobile (03XX-XXXXXXX: 11 digits starting with 03) -> +923XXXXXXXXX (13 chars)
 * - Pakistani International mobile (923XXXXXXXXX: 12 digits starting with 923) -> +923XXXXXXXXX (13 chars)
 * - Explicit International format with leading '+' (+[1-9][0-9]{7,14}: 8 to 15 digits total)
 *
 * All other inputs (incomplete numbers, non-Pakistani numbers lacking country code, letters, etc.) return "".
 */
export function canonicalizePhone(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Strip all non-digit characters
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  // 1. Pakistani National mobile format: 11 digits starting with "03"
  // Example: "03001234567", "0321-9876543", "0300 1234567"
  if (digits.length === 11 && digits.startsWith("03")) {
    return `+923${digits.slice(2)}`;
  }

  // 2. Pakistani International without leading '+': 12 digits starting with "923"
  // Example: "923001234567"
  if (digits.length === 12 && digits.startsWith("923")) {
    return `+923${digits.slice(3)}`;
  }

  // 3. Explicit International format with leading '+'
  // ITU-T E.164 requires 8 to 15 digits following '+', country code starting with 1-9
  if (trimmed.startsWith("+")) {
    if (digits.length >= 8 && digits.length <= 15 && digits[0] !== "0") {
      return `+${digits}`;
    }
    return ""; // Malformed or invalid length with '+'
  }

  // 4. Any other number without explicit '+' and not matching recognized Pakistani formats
  // cannot be safely assigned a country code. Reject as invalid to prevent fabrication or collision.
  return "";
}
