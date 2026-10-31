/**
 * Header Governor — Per-Direction Header Policy Engine
 *
 * The gateway's third surface where correctness hides in plain
 * string lists: which headers may pass, which must be rewritten,
 * which must be injected or stripped per direction.
 *
 * Rule model — an ordered rule list applied per direction
 * (request→upstream and response→client):
 *
 *   - `hop-by-hop`    — strip transport headers that MUST NOT be
 *                        forwarded per RFC 2616 §13.5.1 plus whatever
 *                        `Connection` nominates dynamically (the
 *                        part everyone gets wrong: the *value* of
 *                        Connection names more headers to strip)
 *   - `strip`         — unconditional removal (matched case-insensitively,
 *                        wildcard `x-*` supported)
 *   - `set`           — overwrite with a fixed value
 *   - `set-if-absent` — inject only when missing (x-forwarded-* style)
 *   - `append`        — comma-join onto an existing value (RFC list
 *                        semantics for `via`, `x-forwarded-for`)
 *   - `rename`        — copy under a new name, drop the old
 *   - `transform`     — apply a caller function to the value
 *
 * Rules compile to a small pipeline per direction — O(rules × headers)
 * per request, with the Connection-derived strip set resolved per
 * message because it's dynamic.
 *
 * @module ApiGatewayLayer/Engine3
 */

export type HeaderRule =
  | { readonly kind: 'strip'; readonly name: string }
  | { readonly kind: 'set'; readonly name: string; readonly value: string }
  | { readonly kind: 'set-if-absent'; readonly name: string; readonly value: string }
  | { readonly kind: 'append'; readonly name: string; readonly value: string }
  | { readonly kind: 'rename'; readonly from: string; readonly to: string }
  | { readonly kind: 'transform'; readonly name: string; readonly fn: (v: string) => string };

/** Headers that must never be forwarded (RFC 2616/7230 hop-by-hop). */
export const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** Parse the dynamic strip list out of a Connection header value. */
export function connectionNominatedHeaders(connection: string | undefined): string[] {
  if (!connection) return [];
  return connection
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && !HOP_BY_HOP.has(s));
}

interface CompiledRules {
  /** Exact-name strips (lowercased). */
  strips: Set<string>;
  /** Wildcard strip prefixes, e.g. 'x-internal-'. */
  stripPrefixes: string[];
  ordered: HeaderRule[];
}

function compile(rules: readonly HeaderRule[]): CompiledRules {
  const strips = new Set<string>();
  const stripPrefixes: string[] = [];
  for (const r of rules) {
    if (r.kind === 'strip') {
      const name = r.name.toLowerCase();
      if (name.endsWith('*')) stripPrefixes.push(name.slice(0, -1));
      else strips.add(name);
    }
  }
  return { strips, stripPrefixes, ordered: [...rules] };
}

export interface GovernorOptions {
  /** Rules for the request direction (client → upstream). */
  readonly request?: readonly HeaderRule[];
  /** Rules for the response direction (upstream → client). */
  readonly response?: readonly HeaderRule[];
  /** Strip hop-by-hop headers and Connection nominations (default true). */
  readonly stripHopByHop?: boolean;
  /** Append `via: 1.1 gateway` on responses (default false). */
  readonly viaTag?: string;
}

export class HeaderGovernor {
  private readonly req: CompiledRules;
  private readonly res: CompiledRules;
  private readonly stripHbh: boolean;
  private readonly viaTag: string | undefined;

  constructor(options: GovernorOptions = {}) {
    this.req = compile(options.request ?? []);
    this.res = compile(options.response ?? []);
    this.stripHbh = options.stripHopByHop ?? true;
    this.viaTag = options.viaTag;
  }

  /** Process request headers client → upstream. Returns new map. */
  applyRequest(headers: Readonly<Record<string, string>>): Record<string, string> {
    return this.apply(headers, this.req);
  }

  /** Process response headers upstream → client. */
  applyResponse(headers: Readonly<Record<string, string>>): Record<string, string> {
    const out = this.apply(headers, this.res);
    if (this.viaTag !== undefined) {
      const existing = out['via'];
      out['via'] = existing ? `${existing}, ${this.viaTag}` : this.viaTag;
    }
    return out;
  }

  private apply(
    headers: Readonly<Record<string, string>>,
    rules: CompiledRules
  ): Record<string, string> {
    const out: Record<string, string> = {};
    // Map to lowercase names for consistent handling; preserve the
    // last value when duplicated.
    const lower = new Map<string, string>();
    for (const [k, v] of Object.entries(headers)) lower.set(k.toLowerCase(), v);

    // Dynamic hop-by-hop strips driven by the Connection value.
    const nominated = this.stripHbh ? connectionNominatedHeaders(lower.get('connection')) : [];
    const dynamicStrips = new Set(nominated);

    for (const [k, v] of lower) {
      if (this.stripHbh && (HOP_BY_HOP.has(k) || dynamicStrips.has(k))) continue;
      if (rules.strips.has(k)) continue;
      if (rules.stripPrefixes.some((p) => k.startsWith(p))) continue;
      out[k] = v;
    }

    // Ordered rules — applied in declaration order on the stripped map.
    for (const r of rules.ordered) {
      switch (r.kind) {
        case 'strip':
          break; // already applied in the strip pass
        case 'set':
          out[r.name.toLowerCase()] = r.value;
          break;
        case 'set-if-absent': {
          const name = r.name.toLowerCase();
          if (out[name] === undefined) out[name] = r.value;
          break;
        }
        case 'append': {
          const name = r.name.toLowerCase();
          out[name] = out[name] !== undefined ? `${out[name]}, ${r.value}` : r.value;
          break;
        }
        case 'rename': {
          const from = r.from.toLowerCase();
          if (out[from] !== undefined) {
            out[r.to.toLowerCase()] = out[from];
            delete out[from];
          }
          break;
        }
        case 'transform': {
          const name = r.name.toLowerCase();
          if (out[name] !== undefined) out[name] = r.fn(out[name]!);
          break;
        }
      }
    }
    return out;
  }
}

/**
 * Common security header policy — a ready-made response rule set:
 * strips upstream server leakage, sets standard hardening headers.
 */
export function securityHeadersPolicy(): readonly HeaderRule[] {
  return [
    { kind: 'strip', name: 'server' },
    { kind: 'strip', name: 'x-powered-by' },
    { kind: 'strip', name: 'x-aspnet-version' },
    { kind: 'set-if-absent', name: 'x-content-type-options', value: 'nosniff' },
    { kind: 'set-if-absent', name: 'x-frame-options', value: 'DENY' },
    { kind: 'set-if-absent', name: 'referrer-policy', value: 'strict-origin-when-cross-origin' },
  ];
}

/** Standard forwarding headers for the request direction. */
export function forwardingHeadersPolicy(gatewayId: string): readonly HeaderRule[] {
  return [
    { kind: 'append', name: 'x-forwarded-for', value: '{{client-ip}}' }, // placeholder resolved by caller transform
    { kind: 'set', name: 'x-gateway', value: gatewayId },
    { kind: 'strip', name: 'x-internal-*' },
  ];
}
