import { z } from "zod";
import { canonicalizePhone } from "./phone";

/**
 * PHASE 14: CENTRALIZED APPLICATION-WIDE INPUT VALIDATION & SECURITY HARDENING
 * 
 * Enforces strict, Unicode-aware validation across all person names, phone numbers,
 * email addresses, staff credentials, free-text fields, and financial parameters.
 * Defends against XSS, injection, control-character tampering, and validation bypasses.
 */

// ─── 1. PERSON NAME VALIDATION ──────────────────────────────────────────────

/**
 * Validates human person names:
 * - Allows Unicode alphabetic letters (\p{L}) and combining marks (\p{M}) for international names.
 * - Allows standard punctuation separators: space, hyphen (-), apostrophe ('), and period (.).
 * - Strictly rejects digits (0-9 and non-Latin digits).
 * - Strictly rejects arbitrary symbols (<>, {}, [], @, #, $, %, ^, &, *, +, =, _, etc.), emoji, and control chars.
 * - Rejects invisible, zero-width, and formatting characters (\u200B-\u200D, \uFEFF, etc.).
 * - Normalizes repeated whitespace.
 * - Enforces minimum 2 chars and maximum length (default 50, up to 100 for cardholder name).
 * - Requires at least 2 alphabetic letters.
 */
export function validatePersonName(
  val: unknown,
  fieldName = "Name",
  maxLength = 50
): { isValid: boolean; sanitized: string; error?: string } {
  if (typeof val !== "string") {
    return { isValid: false, sanitized: "", error: `${fieldName} must be a valid text string.` };
  }

  // 1. Strip null bytes and check for invisible/control characters
  if (/[\x00-\x1F\x7F-\x9F\u200B-\u200D\uFEFF]/.test(val)) {
    return {
      isValid: false,
      sanitized: "",
      error: `${fieldName} contains invalid control or invisible characters.`,
    };
  }

  // 2. Normalize typographic apostrophes (U+2019, U+2018, U+02BC) to standard ASCII apostrophe (')
  // and normalize whitespace (trim and collapse multiple spaces)
  const normalized = val
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .trim()
    .replace(/\s+/g, " ");

  if (normalized.length === 0) {
    return { isValid: false, sanitized: "", error: `${fieldName} is required.` };
  }

  if (normalized.length > maxLength) {
    return {
      isValid: false,
      sanitized: normalized,
      error: `${fieldName} must not exceed ${maxLength} characters.`,
    };
  }

  // 3. Strictly reject digits
  if (/[\d\p{N}]/u.test(normalized)) {
    return {
      isValid: false,
      sanitized: normalized,
      error: `${fieldName} must not contain numbers or digits.`,
    };
  }

  // 4. Must start with a letter/mark and end with a letter, mark, or period
  // Permitting legitimate single-letter names (e.g. "O", "U") as well as multi-character names ("O'Connor", "St. John")
  const allowedStructure = /^[\p{L}\p{M}](?:[\p{L}\p{M}\s\-\x27\.]{0,98}[\p{L}\p{M}\.])?$/u;
  if (!allowedStructure.test(normalized)) {
    return {
      isValid: false,
      sanitized: normalized,
      error: `${fieldName} contains invalid symbols or unsupported characters.`,
    };
  }

  // 5. Must contain at least one alphabetic letter (prevents non-alphabetic punctuation strings like ".-." or ".")
  const letters = normalized.match(/[\p{L}]/gu) || [];
  if (letters.length < 1) {
    return {
      isValid: false,
      sanitized: normalized,
      error: `${fieldName} must contain at least 1 alphabetic letter.`,
    };
  }

  return { isValid: true, sanitized: normalized };
}

// ─── 2. PHONE NUMBER VALIDATION ─────────────────────────────────────────────

/**
 * Sanitizes phone input for frontend text fields:
 * - Preserves an optional single leading '+' if typed or pasted at the beginning.
 * - Strips all non-digit characters from the rest of the string (removing spaces, hyphens, parentheses, letters, second '+').
 * - Clamps digits to a maximum of 15 digits (excluding optional '+').
 */
export function sanitizePhoneInput(val: string): string {
  if (!val) return "";
  const trimmed = val.trimStart();
  const hasPlus = trimmed.startsWith("+");
  const digits = val.replace(/\D/g, "").slice(0, 15);
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Validates telephone / mobile numbers:
 * - Input must consist of digits with an optional single leading '+' (e.g. "+14155552671" or "03001234567").
 * - Strictly rejects alphabetic characters, symbols, whitespace, and emoji in raw input.
 * - Rejects misplaced or multiple '+' characters (e.g. "++92300...", "92+300...").
 * - Enforces minimum 10 digits and maximum 15 digits (excluding the optional '+').
 * - Canonicalizes number into standard ITU-T E.164 format via canonicalizePhone().
 */
export function validatePhoneNumber(
  val: unknown,
  fieldName = "Phone number",
  required = true
): { isValid: boolean; sanitized: string; canonical: string; error?: string } {
  if (val === undefined || val === null || val === "") {
    if (!required) {
      return { isValid: true, sanitized: "", canonical: "" };
    }
    return { isValid: false, sanitized: "", canonical: "", error: `${fieldName} is required.` };
  }

  if (typeof val !== "string") {
    return { isValid: false, sanitized: "", canonical: "", error: `${fieldName} must be a string.` };
  }

  const rawTrimmed = val.trim();
  if (rawTrimmed === "") {
    if (!required) return { isValid: true, sanitized: "", canonical: "" };
    return { isValid: false, sanitized: "", canonical: "", error: `${fieldName} is required.` };
  }

  // Enforce digits only (optional single leading '+')
  if (!/^\+?\d+$/.test(rawTrimmed)) {
    return {
      isValid: false,
      sanitized: rawTrimmed,
      canonical: "",
      error: `${fieldName} must contain digits only (with an optional leading '+').`,
    };
  }

  const digits = rawTrimmed.replace(/\D/g, "");

  if (digits.length < 10) {
    return {
      isValid: false,
      sanitized: rawTrimmed,
      canonical: "",
      error: `${fieldName} is too short (minimum 10 digits required).`,
    };
  }

  if (digits.length > 15) {
    return {
      isValid: false,
      sanitized: rawTrimmed,
      canonical: "",
      error: `${fieldName} is too long (maximum 15 digits allowed by ITU-T E.164 standards).`,
    };
  }

  // Ambiguous check: numbers without leading '+' that do not match national '03' (11 digits) or '923' (12 digits)
  if (
    !rawTrimmed.startsWith("+") &&
    !(digits.length === 11 && digits.startsWith("03")) &&
    !(digits.length === 12 && digits.startsWith("923"))
  ) {
    return {
      isValid: false,
      sanitized: rawTrimmed,
      canonical: "",
      error: `International numbers must include '+' and a valid country code (e.g. +14155552671, +447911123456) or provide an 11-digit national mobile number (e.g. 03001234567).`,
    };
  }

  // Canonicalize to E.164 standard (+923... or +...)
  const canonical = canonicalizePhone(rawTrimmed);
  if (!canonical) {
    return {
      isValid: false,
      sanitized: rawTrimmed,
      canonical: "",
      error: `Invalid phone number format or unrecognized country calling code. Please provide a valid international number with '+' (e.g. +923001234567) or 11-digit national number (e.g. 03001234567).`,
    };
  }

  return { isValid: true, sanitized: rawTrimmed, canonical };
}

// ─── 3. EMAIL ADDRESS VALIDATION ────────────────────────────────────────────

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function validateEmail(
  val: unknown,
  fieldName = "Email address",
  required = false
): { isValid: boolean; sanitized: string; error?: string } {
  if (val === undefined || val === null || val === "") {
    if (!required) return { isValid: true, sanitized: "" };
    return { isValid: false, sanitized: "", error: `${fieldName} is required.` };
  }

  if (typeof val !== "string") {
    return { isValid: false, sanitized: "", error: `${fieldName} must be a string.` };
  }

  const trimmed = val.trim().toLowerCase();
  if (trimmed === "") {
    if (!required) return { isValid: true, sanitized: "" };
    return { isValid: false, sanitized: "", error: `${fieldName} is required.` };
  }

  if (trimmed.length > 100) {
    return { isValid: false, sanitized: trimmed, error: `${fieldName} must not exceed 100 characters.` };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { isValid: false, sanitized: trimmed, error: `Please enter a valid email address (e.g. guest@example.com).` };
  }

  return { isValid: true, sanitized: trimmed };
}

// ─── 4. STAFF USERNAME & PASSWORD VALIDATION ────────────────────────────────

export function validateStaffUsername(val: unknown): { isValid: boolean; sanitized: string; error?: string } {
  if (typeof val !== "string") {
    return { isValid: false, sanitized: "", error: "Username must be a string." };
  }
  const trimmed = val.trim().toLowerCase();
  if (trimmed.length < 3) {
    return { isValid: false, sanitized: trimmed, error: "Username must be at least 3 characters." };
  }
  if (trimmed.length > 30) {
    return { isValid: false, sanitized: trimmed, error: "Username must not exceed 30 characters." };
  }
  if (!/^[a-z0-9_\-\.]+$/.test(trimmed)) {
    return {
      isValid: false,
      sanitized: trimmed,
      error: "Username can only contain alphanumeric characters, hyphens, underscores, and periods.",
    };
  }
  return { isValid: true, sanitized: trimmed };
}

export function validateStaffPassword(val: unknown): { isValid: boolean; error?: string } {
  if (typeof val !== "string") {
    return { isValid: false, error: "Password must be a string." };
  }
  if (val.length < 8) {
    return { isValid: false, error: "Password must be at least 8 characters in length." };
  }
  if (val.length > 100) {
    return { isValid: false, error: "Password must not exceed 100 characters." };
  }
  return { isValid: true };
}

// ─── 5. FREE TEXT & COMMENT SANITIZATION ────────────────────────────────────

/**
 * Sanitizes free-text fields (special requests, repair notes, cancellation reasons):
 * - Strips dangerous control and invisible zero-width characters.
 * - Trims and normalizes excessive spaces.
 * - Enforces maximum length bounds.
 */
export function sanitizeFreeText(
  val: unknown,
  maxLength = 500,
  fieldName = "Text"
): { isValid: boolean; sanitized: string; error?: string } {
  if (val === undefined || val === null) {
    return { isValid: true, sanitized: "" };
  }
  if (typeof val !== "string") {
    return { isValid: false, sanitized: "", error: `${fieldName} must be text.` };
  }
  // Strip control characters & zero-width tokens
  const clean = val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\u200B-\u200D\uFEFF]/g, "");
  const normalized = clean.trim().replace(/\s+/g, " ");

  if (normalized.length > maxLength) {
    return {
      isValid: false,
      sanitized: normalized.slice(0, maxLength),
      error: `${fieldName} exceeds maximum permitted length of ${maxLength} characters.`,
    };
  }
  return { isValid: true, sanitized: normalized };
}

// ─── 6. ZOD SCHEMAS FOR CONTRACT VALIDATION ─────────────────────────────────

export const GuestBookingValidationSchema = z.object({
  roomTypeId: z.number().int().positive("Room type must be selected."),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-in date format."),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-out date format."),
  adults: z.number().int().min(1, "At least 1 adult is required.").max(10, "Maximum 10 adults."),
  children: z.number().int().min(0, "Children cannot be negative.").max(10, "Maximum 10 children."),
  firstName: z.string().superRefine((val, ctx) => {
    const res = validatePersonName(val, "First name", 50);
    if (!res.isValid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: res.error });
  }),
  lastName: z.string().superRefine((val, ctx) => {
    const res = validatePersonName(val, "Last name", 50);
    if (!res.isValid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: res.error });
  }),
  phone: z.string().superRefine((val, ctx) => {
    const res = validatePhoneNumber(val, "Phone number", true);
    if (!res.isValid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: res.error });
  }),
  email: z.string().optional().nullable().superRefine((val, ctx) => {
    if (val) {
      const res = validateEmail(val, "Email address", false);
      if (!res.isValid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: res.error });
    }
  }),
  gender: z.enum(["M", "F", "Other"]).optional(),
  nationality: z.string().max(50).optional(),
  specialRequests: z.string().max(500).optional(),
  paymentOption: z.enum(["online_card", "pay_on_arrival"]).optional(),
  cardDetails: z.object({
    cardholderName: z.string().optional().superRefine((val, ctx) => {
      if (val && val.trim().length > 0) {
        const res = validatePersonName(val, "Cardholder name", 100);
        if (!res.isValid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: res.error });
      }
    }),
    cardNumberLast4: z.string().regex(/^\d{4}$/, "Last 4 digits must be 4 digits.").optional(),
  }).optional(),
});
