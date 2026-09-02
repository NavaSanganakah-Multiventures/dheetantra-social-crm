// ---------------------------------------------------------------------------
// G.711 mu-law <-> 16-bit PCM conversion + simple resampling helpers used by the
// Plivo <Stream> <-> Gemini Live voice bot bridge.
//
// Plivo Audio Streaming speaks "audio/x-mulaw;rate=8000" (8kHz mu-law, ~160
// bytes per 20ms chunk). Gemini Live accepts "audio/pcm;rate=16000" (16kHz,
// 16-bit little-endian) on input and emits "audio/pcm;rate=24000" (24kHz) on
// output. This module bridges those formats with no external dependencies.
// ---------------------------------------------------------------------------

// Precomputed mu-law decode table (256 entries, 16-bit PCM out).
const MULAW_DECODE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const sign = u & 0x80 ? -1 : 1;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  MULAW_DECODE[i] = sign * sample;
}

const BIAS = 0x84;
const CLIP = 32635;

// Encode one 16-bit PCM sample to a mu-law byte (G.711).
function linearToMulaw(sample: number): number {
  let sign = 0;
  let x = sample | 0;
  if (x < 0) {
    x = -x;
    sign = 0x80;
  }
  if (x > CLIP) x = CLIP;
  x += BIAS;

  let seg = 0;
  if (x & 0x4000) seg = 7;
  else if (x & 0x2000) seg = 6;
  else if (x & 0x1000) seg = 5;
  else if (x & 0x800) seg = 4;
  else if (x & 0x400) seg = 3;
  else if (x & 0x200) seg = 2;
  else if (x & 0x100) seg = 1;
  else seg = 0;

  const mantissa = (x >> (seg + 3)) & 0x0f;
  return (~(sign | (seg << 4) | mantissa)) & 0xff;
}

// Decode a base64 string to a Uint8Array.
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Encode a Uint8Array to a base64 string.
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// mu-law bytes (8kHz) -> Int16 PCM (16kHz) by decoding then 2x linear
// interpolation upsampling. Returns the raw little-endian bytes Gemini expects.
export function mulaw8kToPcm16kBytes(mulaw: Uint8Array): Uint8Array {
  const decoded = new Int16Array(mulaw.length);
  for (let i = 0; i < mulaw.length; i++) decoded[i] = MULAW_DECODE[mulaw[i]];

  const up = new Int16Array(decoded.length * 2);
  for (let i = 0; i < decoded.length; i++) {
    up[i * 2] = decoded[i];
    up[i * 2 + 1] = i + 1 < decoded.length ? (decoded[i] + decoded[i + 1]) >> 1 : decoded[i];
  }
  return new Uint8Array(up.buffer, up.byteOffset, up.byteLength);
}

// Int16 PCM (24kHz, little-endian bytes) -> mu-law bytes (8kHz) by 3x
// average decimation then mu-law encoding.
export function pcm24kBytesToMulaw8k(pcmBytes: Uint8Array): Uint8Array {
  const samples = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength >> 1);
  const outLen = Math.floor(samples.length / 3);
  const out = new Uint8Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const a = samples[i * 3];
    const b = samples[i * 3 + 1];
    const c = samples[i * 3 + 2];
    out[i] = linearToMulaw(Math.round((a + b + c) / 3));
  }
  return out;
}
