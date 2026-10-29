/**
 * Base32 encoding/decoding — RFC 4648.
 *
 * TOTP secrets are conventionally distributed in base32 (e.g. the string
 * in otpauth:// URIs).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const LOOKUP: Readonly<Record<string, number>> = (() => {
  const out: Record<string, number> = {};
  for (let i = 0; i < ALPHABET.length; i++) out[ALPHABET[i]] = i;
  return out;
})();

/** Encode bytes to base32 (no padding). */
export function base32Encode(data: Buffer | Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** Decode a base32 string (case-insensitive, padding optional). */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = LOOKUP[ch];
    if (idx === undefined) {
      throw new Error(`Invalid base32 character: ${ch}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
