/**
 * Base64url encoding/decoding — RFC 4648 §5.
 *
 * JWT uses base64url (no padding) for header, payload and signature.
 */

/**
 * Decode a base64url string to a Buffer.
 * Accepts both padded and unpadded input; also tolerates standard
 * base64 `+` and `/` characters for resilience.
 */
export function base64urlDecode(input: string): Buffer {
  // Convert base64url -> base64
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // Re-add padding
  const remainder = b64.length % 4;
  if (remainder === 1) {
    throw new Error('Invalid base64url length');
  }
  if (remainder === 2) b64 += '==';
  else if (remainder === 3) b64 += '=';
  return Buffer.from(b64, 'base64');
}

/** Decode a base64url string to UTF-8 text. */
export function base64urlDecodeToString(input: string): string {
  return base64urlDecode(input).toString('utf8');
}

/** Encode a Buffer to base64url (no padding). */
export function base64urlEncode(data: Buffer | Uint8Array): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/** Encode a UTF-8 string to base64url. */
export function base64urlEncodeString(text: string): string {
  return base64urlEncode(Buffer.from(text, 'utf8'));
}

/** Decode a base64url segment as JSON. Throws on malformed JSON. */
export function base64urlDecodeJson<T = unknown>(segment: string): T {
  const raw = base64urlDecodeToString(segment);
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Failed to parse base64url JSON segment: ${(err as Error).message}`);
  }
}

/** Encode a JSON-serialisable value to a base64url segment. */
export function base64urlEncodeJson(value: unknown): string {
  return base64urlEncodeString(JSON.stringify(value));
}
