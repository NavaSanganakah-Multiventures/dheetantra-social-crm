import { describe, it, expect, vi } from 'vitest';

// emailService imports 'cloudflare:email' at module level; provide a stub so
// the module can load in a Node test environment. (Anonymous class avoids
// shadowing conflicts with the global EmailMessage type from workers-types.)
vi.mock('cloudflare:email', () => ({
  EmailMessage: class {
    // Real Cloudflare API: new EmailMessage(sender, recipient, rawMime) = (from, to, raw).
    from: string;
    to: string;
    raw: string;
    constructor(from: string, to: string, raw: string) {
      this.from = from;
      this.to = to;
      this.raw = raw;
    }
  },
}));

import { sanitizeHeaderValue, sanitizeAttachmentType } from '../src/services/emailService';

describe('sanitizeHeaderValue (CRLF injection protection)', () => {
  it('strips CR and LF characters', () => {
    // \r and \n each become a space (never a line break)
    expect(sanitizeHeaderValue('attacker@evil.com\r\nBcc: victim@victim.com')).toBe('attacker@evil.com  Bcc: victim@victim.com');
    expect(sanitizeHeaderValue('user@example.com\nX-Evil: 1')).toBe('user@example.com X-Evil: 1');
    expect(sanitizeHeaderValue('a\rb')).toBe('a b');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeHeaderValue('  padded@example.com  ')).toBe('padded@example.com');
  });

  it('returns empty string for null/undefined/empty input', () => {
    expect(sanitizeHeaderValue(null as any)).toBe('');
    expect(sanitizeHeaderValue(undefined as any)).toBe('');
    expect(sanitizeHeaderValue('')).toBe('');
  });

  it('keeps safe values unchanged', () => {
    expect(sanitizeHeaderValue('valid@example.com')).toBe('valid@example.com');
  });
});

describe('sanitizeAttachmentType (MIME allowlist)', () => {
  it('allows safe types', () => {
    expect(sanitizeAttachmentType('image/png')).toBe('image/png');
    expect(sanitizeAttachmentType('application/pdf')).toBe('application/pdf');
    expect(sanitizeAttachmentType('text/plain')).toBe('text/plain');
  });

  it('strips parameters from the MIME type', () => {
    expect(sanitizeAttachmentType('image/jpeg; charset=binary')).toBe('image/jpeg');
  });

  it('forces unsafe types to octet-stream', () => {
    expect(sanitizeAttachmentType('text/html')).toBe('application/octet-stream');
    expect(sanitizeAttachmentType('image/svg+xml')).toBe('application/octet-stream');
    expect(sanitizeAttachmentType('application/x-javascript')).toBe('application/octet-stream');
  });

  it('handles casing and empty values', () => {
    expect(sanitizeAttachmentType('IMAGE/PNG')).toBe('image/png');
    expect(sanitizeAttachmentType('')).toBe('application/octet-stream');
    expect(sanitizeAttachmentType(null as any)).toBe('application/octet-stream');
  });
});
