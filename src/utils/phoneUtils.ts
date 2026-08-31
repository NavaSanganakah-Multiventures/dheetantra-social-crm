/**
 * Central utility for standardizing phone number formats across different providers.
 */

/**
 * Normalizes any phone number string to standard E.164 format.
 * - Strips all non-digit characters.
 * - Prepends '+' sign.
 * - Defaults to country code '91' (India) if length is 10.
 * 
 * E.g., '9669509952' -> '+919669509952'
 * '+1 (555) 123-4567' -> '+15551234567'
 */
export function normalizeE164(raw: string, defaultCountryCode = '91'): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
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

/**
 * Formats a phone number for Twilio API.
 * Twilio strictly requires full E.164 format including the '+' prefix.
 * 
 * E.g., '919669509952' -> '+919669509952'
 */
export function formatForTwilio(raw: string): string {
  return normalizeE164(raw);
}

/**
 * Formats a phone number for Plivo API.
 * Plivo supports E.164. Using E.164 consistently is recommended.
 * 
 * E.g., '919669509952' -> '+919669509952'
 */
export function formatForPlivo(raw: string): string {
  // Plivo typically routes well with raw E.164 numbers (or digits-only for some endpoints, 
  // but standard E.164 + is the safest standard across voice routing).
  return normalizeE164(raw);
}
