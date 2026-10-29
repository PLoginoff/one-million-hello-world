/**
 * Multi-Tenancy — Resolution Strategies
 *
 * Concrete TenantResolver implementations matching common SaaS patterns:
 *
 *   - SubdomainResolver: `acme.api.example.com` → `acme` (host header,
 *     apex-domain aware, www. skipped).
 *   - HeaderResolver: `X-Tenant-ID: acme`.
 *   - TokenClaimResolver: a JWT claim (`tenant`, `org_id`, custom).
 *   - QueryResolver: `?tenant=acme` — opt-in, mostly for dev.
 *   - CompositeResolver: ordered chain, first hit wins.
 *
 * A resolver returns the tenant *identifier* — validating that it exists
 * and is ACTIVE is the TenantRegistry's job, keeping resolvers pure.
 *
 * @module MultiTenancy/Tenancy
 */

import {
  TenantResolutionRequest,
  TenantResolver,
} from './TenantTypes';

function firstHeader(headers: TenantResolutionRequest['headers'], name: string): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (v === undefined) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return s.trim() === '' ? undefined : s.trim();
}

/**
 * Extract tenant slug from `host`. The apex domain (e.g. `api.example.com`
 * or `example.com`) is configurable; the tenant is the left-most label
 * that isn't `www` and isn't part of the apex.
 *
 * `acme.api.example.com` + apex `api.example.com` → `acme`
 * `api.example.com`                             → undefined
 * `acme.example.com`     + apex `example.com`   → `acme`
 */
export class SubdomainResolver implements TenantResolver {
  readonly name = 'subdomain' as const;
  private readonly _apexDomains: ReadonlyArray<string>;

  /**
   * @param apexDomains Longest-suffix match wins — list e.g.
   *   `['api.example.com', 'example.com']`; both forms are tried.
   */
  constructor(apexDomains: ReadonlyArray<string>) {
    // Sort descending by label count so 'api.example.com' beats 'example.com'.
    this._apexDomains = [...apexDomains].sort(
      (a, b) => b.split('.').length - a.split('.').length
    );
  }

  resolve(req: TenantResolutionRequest): string | undefined {
    const host = (req.host ?? firstHeader(req.headers, 'host'))?.split(':')[0]?.toLowerCase();
    if (!host) return undefined;
    for (const apex of this._apexDomains) {
      if (host === apex) return undefined;
      if (host.endsWith(`.${apex}`)) {
        const prefix = host.slice(0, host.length - apex.length - 1);
        const leftmost = prefix.split('.')[0];
        if (leftmost !== 'www' && leftmost !== '') return leftmost;
        return undefined;
      }
    }
    return undefined;
  }
}

/** `X-Tenant-ID`-style header. */
export class HeaderResolver implements TenantResolver {
  readonly name = 'header' as const;
  private readonly _headerName: string;

  constructor(headerName = 'x-tenant-id') {
    this._headerName = headerName.toLowerCase();
  }

  resolve(req: TenantResolutionRequest): string | undefined {
    return firstHeader(req.headers, this._headerName);
  }
}

/**
 * JWT/token claim resolver — reads already-decoded claims off the request
 * (the transport/JWT layer decodes + verifies; we just look the claim up).
 * Claim names tried in order: configured name, `tenant`, `org_id`, `tid`.
 */
export class TokenClaimResolver implements TenantResolver {
  readonly name = 'token' as const;
  private readonly _claimNames: ReadonlyArray<string>;

  constructor(claimName?: string) {
    this._claimNames = claimName !== undefined ? [claimName, 'tenant', 'org_id', 'tid'] : ['tenant', 'org_id', 'tid'];
  }

  resolve(req: TenantResolutionRequest): string | undefined {
    const claims = req.tokenClaims;
    if (!claims) return undefined;
    for (const n of this._claimNames) {
      const v = claims[n];
      if (typeof v === 'string' && v.trim() !== '') return v.trim();
    }
    return undefined;
  }
}

/** `?tenant=` — dev convenience, usually last in a chain or disabled in prod. */
export class QueryResolver implements TenantResolver {
  readonly name = 'explicit' as const;
  private readonly _param: string;

  constructor(param = 'tenant') {
    this._param = param;
  }

  resolve(req: TenantResolutionRequest): string | undefined {
    const v = req.query?.[this._param];
    if (v === undefined) return undefined;
    const s = Array.isArray(v) ? v[0] : v;
    return s.trim() === '' ? undefined : s.trim();
  }
}

/** Ordered chain — first non-undefined wins; remembers which fired. */
export class CompositeResolver {
  private readonly _resolvers: ReadonlyArray<TenantResolver>;

  constructor(resolvers: ReadonlyArray<TenantResolver>) {
    this._resolvers = resolvers;
  }

  resolve(req: TenantResolutionRequest): { tenantId: string; resolvedBy: TenantResolver['name'] } | undefined {
    for (const r of this._resolvers) {
      const id = r.resolve(req);
      if (id !== undefined) return { tenantId: id, resolvedBy: r.name };
    }
    return undefined;
  }
}
