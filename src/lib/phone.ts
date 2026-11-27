/**
 * Canonicalizes phone numbers to standard E.164-compatible format (+<country><national>).
 * Handles Pakistani mobile format (03XX-XXXXXXX -> +923XXXXXXXXX), international prefix (+),
 * and strips formatting characters (spaces, hyphens, parentheses).
 */
export function canonicalizePhone(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  // Pakistani national format (03XX-XXXXXXX: 11 digits starting with 0) -> +923XXXXXXXXX
  if (digits.length === 11 && digits.startsWith("03")) {
    return `+92${digits.slice(1)}`;
  }

  // Pakistani international format without leading + (923XXXXXXXXX: 12 digits) -> +923XXXXXXXXX
  if (digits.length === 12 && digits.startsWith("923")) {
    return `+${digits}`;
  }

  // International format with explicit '+' in raw input
  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }

  // General 10-15 digit numbers
  if (digits.length >= 10) {
    return `+${digits}`;
  }

  return `+${digits}`;
}
