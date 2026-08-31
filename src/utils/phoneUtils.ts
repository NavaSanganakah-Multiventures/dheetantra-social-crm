/**
 * Central utility for standardizing phone number formats across different providers.
 */

/**
 * Normalizes any phone number string to standard E.164 format.
 * - Strips all non-digit characters.
 * - Strips a single leading '0' (the domestic trunk prefix).
 * - Prepends '+' sign.
 * - Defaults to country code '91' (India) when the number has no '+' prefix
 *   and is exactly 10 digits long.
 *
 * E.g., '9669509952' -> '+919669509952'
 *       '09876543210' -> '+919876543210'
 *       '+1 (555) 123-4567' -> '+15551234567'
 */
export function normalizeE164(raw: string, defaultCountryCode = '91'): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  // Remove the domestic trunk prefix before deciding whether to add a
  // default country code (matches the previous per-route behaviour).
  digits = digits.replace(/^0/, '');
  const hasPlus = trimmed.startsWith('+');
  if (!hasPlus && digits.length === 10) {
    digits = defaultCountryCode + digits;
  }
  return '+' + digits;
}

/**
 * Formats a phone number for WhatsApp Meta API.
 * WhatsApp strictly requires digits ONLY, no '+' prefix.
 *
 * E.g., '+919669509952' -> '919669509952'
 */
export function formatForWhatsApp(raw: string): string {
  if (!raw) return '';
  return normalizeE164(raw).replace('+', '');
}
