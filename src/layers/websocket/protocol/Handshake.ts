/**
 * Handshake — RFC 6455 §4 opening-handshake validation and construction.
 *
 * The WebSocket handshake is an HTTP/1.1 Upgrade exchange:
 *
 * Client → server:
 * ```
 * GET /chat HTTP/1.1
 * Host: example.com
 * Upgrade: websocket
 * Connection: Upgrade
 * Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
 * Sec-WebSocket-Version: 13
 * Sec-WebSocket-Protocol: chat, superchat   (optional)
 * Sec-WebSocket-Extensions: permessage-...  (optional)
 * ```
 *
 * Server → client:
 * ```
 * HTTP/1.1 101 Switching Protocols
 * Upgrade: websocket
 * Connection: Upgrade
 * Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
 * ```
 *
 * The Accept value is `base64(SHA1(key + GUID))` where the GUID is fixed
 * by the spec. This binds the response to the request and proves the
 * server actually implements WebSocket rather than being a confused HTTP
 * endpoint (§1.3).
 *
 * @module WebsocketLayer/Protocol
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { HandshakeValidation } from './types';

/**
 * The magic GUID from RFC 6455 §1.3 — concatenated with the client key
 * before hashing. Chosen once by the spec authors; identical everywhere.
 */
export const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** The only protocol version this implementation speaks (RFC 6455). */
export const SUPPORTED_VERSION = 13;

/**
 * Minimal parsed shape of the client handshake request.
 * Header names are case-insensitive per HTTP; callers should normalize
 * to lowercase keys before constructing this.
 */
export interface HandshakeRequest {
  /** HTTP method — must be GET. */
  readonly method: string;
  /** HTTP version major/minor, e.g. `1.1`. */
  readonly httpVersion: string;
  /** Lowercased header map. */
  readonly headers: ReadonlyMap<string, string>;
  /** Request path (informational; kept for origin checks upstream). */
  readonly path: string;
}

/** Options for `validateHandshake`. */
export interface HandshakeOptions {
  /** Subprotocols the server is willing to speak, in preference order. */
  readonly supportedSubprotocols?: readonly string[];
  /** Allowed `Origin` values; empty/undefined = allow all. */
  readonly allowedOrigins?: readonly string[];
  /** Maximum accepted header block size — defensive cap. */
  readonly maxHeaderBytes?: number;
}

/**
 * Compute the `Sec-WebSocket-Accept` value for a given client key.
 *
 * accept = base64( SHA-1( key ‖ "258EAFA5-..." ) )
 *
 * Note: the client key is *not* base64-decoded first — the ASCII string
 * is concatenated verbatim. This is a deliberate spec quirk.
 */
export function computeAcceptKey(clientKey: string): string {
  return createHash('sha1').update(clientKey + WS_GUID, 'ascii').digest('base64');
}

/**
 * Generate a fresh 16-byte `Sec-WebSocket-Key` (client side).
 */
export function generateClientKey(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Validate a parsed client handshake per §4.2.1.
 *
 * Checks performed:
 *  1. method is GET
 *  2. HTTP version >= 1.1
 *  3. `Upgrade: websocket` present (token-insensitive match)
 *  4. `Connection` contains the `Upgrade` token (it may be a list)
 *  5. `Sec-WebSocket-Key` present and decodes to exactly 16 bytes
 *  6. `Sec-WebSocket-Version` is 13
 *  7. `Origin` is in the allow-list, when one is configured
 *
 * All failures are collected and returned rather than thrown — a server
 * typically wants to respond with a proper 400 and log every reason.
 */
export function validateHandshake(
  request: HandshakeRequest,
  options: HandshakeOptions = {}
): HandshakeValidation {
  const errors: string[] = [];

  // 1. Method
  if (request.method.toUpperCase() !== 'GET') {
    errors.push(`Method must be GET, got ${request.method}`);
  }

  // 2. HTTP version — WebSocket requires the 1.1 Upgrade mechanism.
  const [major, minor] = request.httpVersion.split('.').map((p) => parseInt(p, 10));
  if (Number.isNaN(major) || major < 1 || (major === 1 && (Number.isNaN(minor) || minor < 1))) {
    errors.push(`HTTP version must be >= 1.1, got ${request.httpVersion}`);
  }

  // 3. Upgrade header
  const upgrade = request.headers.get('upgrade');
  if (!headerHasToken(upgrade, 'websocket')) {
    errors.push('Missing or invalid Upgrade: websocket header');
  }

  // 4. Connection header — may be a comma list like "keep-alive, Upgrade".
  const connection = request.headers.get('connection');
  if (!headerHasToken(connection, 'upgrade')) {
    errors.push('Missing or invalid Connection: Upgrade header');
  }

  // 5. Sec-WebSocket-Key — must decode to exactly 16 bytes (§4.1 item 5).
  const key = request.headers.get('sec-websocket-key');
  if (key === undefined) {
    errors.push('Missing Sec-WebSocket-Key header');
  } else {
    const decoded = tryBase64Length(key);
    if (decoded !== 16) {
      errors.push(`Sec-WebSocket-Key must decode to 16 bytes, got ${decoded}`);
    }
  }

  // 6. Version
  const version = request.headers.get('sec-websocket-version');
  if (version !== String(SUPPORTED_VERSION)) {
    errors.push(`Sec-WebSocket-Version must be ${SUPPORTED_VERSION}, got ${version ?? 'missing'}`);
  }

  // 7. Origin allow-list (if configured)
  if (options.allowedOrigins && options.allowedOrigins.length > 0) {
    const origin = request.headers.get('origin');
    if (origin === undefined || !options.allowedOrigins.includes(origin)) {
      errors.push(`Origin ${origin ?? 'missing'} not in allow-list`);
    }
  }

  // Subprotocol negotiation: pick the first server-preferred protocol the
  // client also offered. Absent on either side → no subprotocol.
  let subprotocol: string | null = null;
  const offeredRaw = request.headers.get('sec-websocket-protocol');
  const supported = options.supportedSubprotocols;
  if (offeredRaw && supported && supported.length > 0) {
    const offered = offeredRaw.split(',').map((s) => s.trim());
    subprotocol = supported.find((p) => offered.includes(p)) ?? null;
  }

  const valid = errors.length === 0;
  return {
    valid,
    acceptKey: valid && key ? computeAcceptKey(key) : null,
    errors,
    subprotocol,
  };
}

/**
 * Build the server's `101 Switching Protocols` response text.
 */
export function buildHandshakeResponse(
  acceptKey: string,
  subprotocol: string | null = null,
  extraHeaders: Readonly<Record<string, string>> = {}
): string {
  const lines = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
  ];
  if (subprotocol) {
    lines.push(`Sec-WebSocket-Protocol: ${subprotocol}`);
  }
  for (const [k, v] of Object.entries(extraHeaders)) {
    lines.push(`${k}: ${v}`);
  }
  return lines.join('\r\n') + '\r\n\r\n';
}

/**
 * Build a client handshake request (useful for tests and for client-side
 * connection establishment).
 */
export function buildClientHandshake(options: {
  host: string;
  path?: string;
  subprotocols?: readonly string[];
  origin?: string;
  extraHeaders?: Readonly<Record<string, string>>;
}): { requestText: string; key: string } {
  const key = generateClientKey();
  const lines = [
    `GET ${options.path ?? '/'} HTTP/1.1`,
    `Host: ${options.host}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    `Sec-WebSocket-Version: ${SUPPORTED_VERSION}`,
  ];
  if (options.subprotocols && options.subprotocols.length > 0) {
    lines.push(`Sec-WebSocket-Protocol: ${options.subprotocols.join(', ')}`);
  }
  if (options.origin) {
    lines.push(`Origin: ${options.origin}`);
  }
  for (const [k, v] of Object.entries(options.extraHeaders ?? {})) {
    lines.push(`${k}: ${v}`);
  }
  return { requestText: lines.join('\r\n') + '\r\n\r\n', key };
}

/**
 * Verify a `Sec-WebSocket-Accept` header against the key we sent
 * (client side of the handshake, §4.1 item 5).
 * Uses constant-time comparison — cheap insurance against timing oracles.
 */
export function verifyAcceptKey(sentKey: string, acceptHeader: string): boolean {
  const expected = computeAcceptKey(sentKey);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(acceptHeader.trim(), 'utf8');
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

/**
 * Parse a raw HTTP handshake head (everything before the first \r\n\r\n)
 * into a {@link HandshakeRequest}. Throws on malformed input.
 */
export function parseHandshakeRequest(head: string): HandshakeRequest {
  const lines = head.split('\r\n');
  if (lines.length === 0 || !lines[0]) {
    throw new Error('Empty handshake request');
  }
  const requestLine = lines[0].split(' ');
  if (requestLine.length !== 3) {
    throw new Error(`Malformed request line: ${lines[0]}`);
  }
  const [method, path, versionToken] = requestLine;
  const httpVersion = versionToken.startsWith('HTTP/') ? versionToken.slice(5) : '0.0';

  const headers = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) throw new Error(`Malformed header line: ${line}`);
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    // Multiple headers with the same name are combined per RFC 7230 §3.2.2.
    const existing = headers.get(name);
    headers.set(name, existing === undefined ? value : `${existing}, ${value}`);
  }
  return { method, path, httpVersion, headers };
}

/**
 * Case-insensitive, comma-list-aware header token check.
 * `headerHasToken("keep-alive, Upgrade", "upgrade")` → true.
 */
export function headerHasToken(headerValue: string | undefined, token: string): boolean {
  if (headerValue === undefined) return false;
  const lower = token.toLowerCase();
  return headerValue
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .includes(lower);
}

/**
 * Length of `value` base64-decoded, or -1 if it is not valid base64.
 * Kept strict-ish: must be a multiple-of-4 alphabet with optional padding.
 */
function tryBase64Length(value: string): number {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(trimmed) || trimmed.length % 4 !== 0) {
    return -1;
  }
  try {
    return Buffer.from(trimmed, 'base64').byteLength;
  } catch {
    return -1;
  }
}
