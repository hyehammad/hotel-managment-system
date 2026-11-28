import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Canonicalizes phone numbers to standard ITU-T E.164 format (+<country><national>).
 * Utilizes libphonenumber-js for reliable international telephone number validation.
 *
 * Supported regional policy:
 * - Pakistani National mobile numbers beginning with "03" (11 digits): interpreted with PK default region.
 * - Pakistani International format without leading '+' starting with "923" (12 digits): normalized as +923... and validated.
 * - Explicit International format with leading '+' (+<calling-code><national>): validated for country code, length, and national format.
 * - All other inputs (ambiguous numbers without '+', invalid calling codes, invalid national lengths, impossible numbers) return "".
 */
export function canonicalizePhone(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Digits-only extraction (preserving optional single leading '+')
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  let candidate = trimmed;
  let defaultCountry: "PK" | undefined = undefined;

  // 1. Pakistani National mobile format: 11 digits starting with "03"
  // Example: "03001234567" -> +923001234567
  if (!hasLeadingPlus && digits.length === 11 && digits.startsWith("03")) {
    candidate = digits;
    defaultCountry = "PK";
  }
  // 2. Pakistani International without leading '+': 12 digits starting with "923"
  // Example: "923001234567" -> +923001234567
  else if (!hasLeadingPlus && digits.length === 12 && digits.startsWith("923")) {
    candidate = `+${digits}`;
  }
  // 3. Explicit international format with leading '+'
  // Example: "+14155552671", "+447911123456", "+923001234567"
  else if (hasLeadingPlus) {
    candidate = `+${digits}`;
  }
  // 4. Any other number without leading '+' (ambiguous 10, 11, etc. digits) cannot be safely assumed
  else {
    return "";
  }

  try {
    const phoneNumber = parsePhoneNumberFromString(candidate, defaultCountry);
    if (!phoneNumber || !phoneNumber.isValid()) {
      return "";
    }
    // Return standard E.164 string (e.g. "+923001234567", "+14155552671")
    return phoneNumber.number;
  } catch {
    return "";
  }
}
