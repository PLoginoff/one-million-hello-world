/**
 * WebSocket Protocol Negotiator
 *
 * The second half of the upgrade handshake `WsProxyEngine` doesn't
 * cover: what goes *inside* the 101 response besides the accept key.
 *
 *  - **Subprotocol negotiation** — the client offers an ordered
 *    preference list in `Sec-WebSocket-Protocol`; the gateway picks
 *    the first one it also supports, or none. When the upstream
 *    mandates a specific protocol, the gateway can force the choice
 *    or fail the handshake with 400.
 *
 *  - **Extension negotiation** — `Sec-WebSocket-Extensions` carries
 *    parameterized offers like
 *    `permessage-deflate; server_max_window_bits=10; client_max_window_bits`.
 *    The negotiator parses the offer grammar, intersects it with the
 *    extensions the gateway can relay (passthrough, stripped, or
 *    locally-terminated), and emits a well-formed response header.
 *
 *  - **Origin & host checks** — browser-origin policy at the
 *    gateway: allowed origin patterns (exact, `*.suffix`, `*`) and
 *    Host allowlists evaluated before any upstream connection opens.
 *
 * The parser is a hand-rolled tokenizer for the RFC 6455 extension
 * grammar (token / token=token / token="quoted") — the same class of
 * parsing as engine2's query language but over HTTP header syntax.
 *
 * Complexity: O(offers × supported) selection; O(header length) parse.
 *
 * @module ApiGatewayLayer/Engine3
 */

/* ------------------------------------------------------------------ */
/* Origin / host validation                                            */
/* ------------------------------------------------------------------ */

/**
 * Match an Origin header against an allowlist entry.
 * Patterns: `*` (any), exact host, `*.suffix` (subdomain), or
 * `scheme://host[:port]`.
 */
export function originAllowed(origin: string | undefined, allowlist: readonly string[]): boolean {
  if (origin === undefined || origin === 'null') {
    // Non-browser clients (no Origin) pass only when '*' present or
    // the list is empty — an empty allowlist means "don't check".
    return allowlist.length === 0 || allowlist.includes('*');
  }
  if (allowlist.includes('*')) return true;

  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    host = origin.toLowerCase();
  }

  for (const pattern of allowlist) {
    const p = pattern.toLowerCase();
    if (p === origin.toLowerCase()) return true;
    if (p.startsWith('*.')) {
      const suffix = p.slice(2);
      if (host === suffix || host.endsWith('.' + suffix)) return true;
    } else if (p === host) {
      return true;
    } else {
      // Try as full origin URL.
      try {
        const pu = new URL(p.includes('://') ? p : `https://${p}`);
        const ou = new URL(origin.includes('://') ? origin : `https://${origin}`);
        if (pu.host === ou.host && pu.protocol === ou.protocol) return true;
      } catch {
        // Malformed pattern — skip.
      }
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Subprotocol selection                                               */
/* ------------------------------------------------------------------ */

/**
 * Parse a `Sec-WebSocket-Protocol` offer into an ordered list.
 * Returns undefined when absent/empty.
 */
export function parseProtocolOffer(header: string | undefined): readonly string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type SubprotocolVerdict =
  | { readonly kind: 'selected'; readonly protocol: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'reject'; readonly reason: string };

/**
 * Choose a subprotocol.
 *
 * @param offered   client's ordered preference list
 * @param supported protocols the gateway can relay
 * @param required  upstream-mandated protocol (when set, the client
 *                  must have offered it or the handshake fails)
 */
export function negotiateSubprotocol(
  offered: readonly string[],
  supported: readonly string[],
  required?: string
): SubprotocolVerdict {
  if (required !== undefined) {
    if (!offered.includes(required)) {
      return {
        kind: 'reject',
        reason: `client did not offer required subprotocol ${required}`,
      };
    }
    return { kind: 'selected', protocol: required };
  }
  // First client preference the gateway also supports wins.
  for (const p of offered) {
    if (supported.includes(p)) return { kind: 'selected', protocol: p };
  }
  // Client offered protocols we don't support — per RFC 6455 the
  // server may still accept with no subprotocol.
  return { kind: 'none' };
}

/* ------------------------------------------------------------------ */
/* Extension negotiation                                               */
/* ------------------------------------------------------------------ */

/** One extension offer element: name + parameters. */
export interface ExtensionOffer {
  readonly name: string;
  readonly params: Readonly<Record<string, string | true>>;
}

/**
 * Parse `Sec-WebSocket-Extensions`.
 *
 * Grammar (RFC 6455 §9.1):
 *   offers   := offer ("," offer)*
 *   offer    := token (";" param)*
 *   param    := token ("=" (token | quoted))?
 *
 * Quoted strings support backslash escaping.
 */
export function parseExtensions(header: string): readonly ExtensionOffer[] {
  const offers: ExtensionOffer[] = [];
  let i = 0;
  const n = header.length;

  const skipWs = () => {
    while (i < n && (header[i] === ' ' || header[i] === '\t')) i++;
  };

  const token = (): string => {
    const start = i;
    while (i < n && isTokenChar(header[i]!)) i++;
    if (i === start) throw new ExtensionParseError(`expected token at ${i}`);
    return header.slice(start, i);
  };

  const quoted = (): string => {
    if (header[i] !== '"') throw new ExtensionParseError(`expected '"' at ${i}`);
    i++;
    let out = '';
    while (i < n && header[i] !== '"') {
      if (header[i] === '\\' && i + 1 < n) {
        out += header[i + 1];
        i += 2;
      } else {
        out += header[i];
        i++;
      }
    }
    if (i >= n) throw new ExtensionParseError('unterminated quoted string');
    i++; // closing quote
    return out;
  };

  skipWs();
  while (i < n) {
    const name = token();
    const params: Record<string, string | true> = {};
    skipWs();
    while (i < n && header[i] === ';') {
      i++;
      skipWs();
      const pname = token();
      skipWs();
      if (i < n && header[i] === '=') {
        i++;
        skipWs();
        params[pname] = header[i] === '"' ? quoted() : token();
      } else {
        params[pname] = true;
      }
      skipWs();
    }
    offers.push({ name, params });
    if (i < n && header[i] === ',') {
      i++;
      skipWs();
      if (i >= n) throw new ExtensionParseError('trailing comma');
    } else if (i < n) {
      throw new ExtensionParseError(`expected ',' or end at ${i}`);
    }
  }
  return offers;
}

function isTokenChar(c: string): boolean {
  // RFC 7230 token characters.
  const code = c.charCodeAt(0);
  return (
    (code >= 0x21 && code <= 0x7e) &&
    !'()<>@,;:\\"/[]?={} \t'.includes(c)
  );
}

export class ExtensionParseError extends Error {
  constructor(message: string) {
    super(`ExtensionParseError: ${message}`);
    this.name = 'ExtensionParseError';
  }
}

/** How the gateway handles a negotiated extension. */
export type ExtensionDisposition =
  /** Forward unchanged — upstream manages it. */
  | 'passthrough'
  /** Strip from the response — gateway doesn't relay it. */
  | 'strip'
  /** Terminate locally — gateway (not upstream) speaks it. */
  | 'terminate';

export interface ExtensionDecision {
  readonly name: string;
  readonly disposition: ExtensionDisposition;
  /** Params to echo in the response when accepted. */
  readonly acceptedParams: Readonly<Record<string, string | true>>;
}

/**
 * Decide which offered extensions the gateway relays.
 *
 * `policy` maps extension name → disposition. Unknown names strip.
 * `permessage-deflate` gets parameter clamping: `server_max_window_bits`
 * and `client_max_window_bits` are bounded to [8, 15] per RFC 7692.
 */
export function negotiateExtensions(
  offers: readonly ExtensionOffer[],
  policy: Readonly<Record<string, ExtensionDisposition>>
): readonly ExtensionDecision[] {
  const decisions: ExtensionDecision[] = [];
  for (const offer of offers) {
    const disposition = policy[offer.name] ?? 'strip';
    if (disposition === 'strip') {
      decisions.push({ name: offer.name, disposition, acceptedParams: {} });
      continue;
    }
    const accepted: Record<string, string | true> = {};
    if (offer.name === 'permessage-deflate') {
      for (const [k, v] of Object.entries(offer.params)) {
        if (k === 'server_max_window_bits' || k === 'client_max_window_bits') {
          if (v === true) {
            accepted[k] = true; // request without value — server chooses
          } else {
            const num = Number(v);
            accepted[k] = String(Math.max(8, Math.min(15, num)));
          }
        } else if (k === 'server_no_context_takeover' || k === 'client_no_context_takeover') {
          accepted[k] = true;
        }
        // Unknown params are dropped from the response.
      }
    } else {
      Object.assign(accepted, offer.params);
    }
    decisions.push({ name: offer.name, disposition, acceptedParams: accepted });
  }
  return decisions;
}

/** Serialize accepted decisions into a response header value. */
export function formatExtensionResponse(decisions: readonly ExtensionDecision[]): string | undefined {
  const parts: string[] = [];
  for (const d of decisions) {
    if (d.disposition === 'strip') continue;
    let seg = d.name;
    for (const [k, v] of Object.entries(d.acceptedParams)) {
      seg += v === true ? `; ${k}` : `; ${k}=${v}`;
    }
    parts.push(seg);
  }
  return parts.length > 0 ? parts.join(', ') : undefined;
}
