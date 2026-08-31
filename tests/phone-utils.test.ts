import { describe, it, expect } from 'vitest';
import { normalizeE164, formatForWhatsApp } from '../src/utils/phoneUtils';

describe('normalizeE164', () => {
  it('adds India country code to a bare 10-digit number', () => {
    expect(normalizeE164('9876543210')).toBe('+919876543210');
  });

  it('strips the domestic trunk prefix before adding the country code', () => {
    expect(normalizeE164('09876543210')).toBe('+919876543210');
  });

  it('preserves an already-formatted E.164 number', () => {
    expect(normalizeE164('+919876543210')).toBe('+919876543210');
  });

  it('keeps non-Indian numbers with their own country code', () => {
    expect(normalizeE164('+1 (555) 123-4567')).toBe('+15551234567');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeE164('')).toBe('');
  });

  it('returns empty for non-digit input', () => {
    expect(normalizeE164('abc')).toBe('');
    expect(normalizeE164('   ')).toBe('');
  });
});

describe('formatForWhatsApp', () => {
  it('returns digits only without the plus prefix', () => {
    expect(formatForWhatsApp('09876543210')).toBe('919876543210');
  });

  it('adds the country code for a bare 10-digit number', () => {
    expect(formatForWhatsApp('9876543210')).toBe('919876543210');
  });
});
