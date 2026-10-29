/**
 * Secrets Layer — Engine Facade
 *
 * The public entry point composing provider + cache + leases + audit:
 *
 *   - Every access funnels through `audit()` — reads, writes, lists, lease
 *     ops and cache hits/misses are all recorded with the caller principal.
 *   - `materialize(template)` performs `${secret:path[@version]}` expansion
 *     for config interpolation — designed to be registered as the resolver
 *     behind the configuration engine's secret placeholders.
 *   - `issueLease`/`renewLease`/`revokeLease` delegate to the LeaseManager
 *     and audit each operation.
 *   - `rotate(path, newValue)` is `put` + audit sugar that returns both the
 *     new version and the still-readable old version (the grace window).
 *
 * @module Secrets/Vault
 */

import { CachedSecretProvider, SecretCacheStats } from './SecretCache';
import { LeaseManager } from './LeaseManager';
import { SecretAuditLog, AuditQuery } from './SecretAuditLog';
import {
  AuditEntry,
  SecretContext,
  SecretError,
  SecretErrorCode,
  SecretLease,
  SecretProvider,
  SecretRead,
  SecretsClock,
} from './SecretTypes';

export interface SecretsEngineOptions {
  readonly provider: SecretProvider;
  readonly clock?: SecretsClock;
  /** Enable the read-through cache (default true). */
  readonly cache?: boolean;
  readonly cacheTtlMs?: number;
  readonly negativeCacheTtlMs?: number;
  readonly auditCapacity?: number;
  /** Default principal when callers don't supply a SecretContext. */
  readonly defaultPrincipal?: string;
  readonly leaseFactory?: (path: string) => { value: string; payload?: Record<string, string> };
}

const SECRET_REF_RE = /\$\{secret:([^}]+)\}/g;

export class SecretsEngine {
  private readonly _clock: SecretsClock;
  private readonly _provider: SecretProvider;
  private readonly _cache: CachedSecretProvider | null;
  private readonly _leases: LeaseManager;
  private readonly _audit: SecretAuditLog;
  private readonly _defaultPrincipal: string;

  constructor(options: SecretsEngineOptions) {
    this._clock = options.clock ?? Date.now;
    this._provider = options.provider;
    this._cache = options.cache === false ? null : new CachedSecretProvider(options.provider, {
      ttlMs: options.cacheTtlMs,
      negativeTtlMs: options.negativeCacheTtlMs,
      clock: this._clock,
    });
    this._leases = new LeaseManager(this._clock);
    if (options.leaseFactory) this._leases.setDefaultFactory(options.leaseFactory);
    this._audit = new SecretAuditLog(this._clock, options.auditCapacity);
    this._defaultPrincipal = options.defaultPrincipal ?? 'system';
  }

  get leases(): LeaseManager {
    return this._leases;
  }

  get auditLog(): SecretAuditLog {
    return this._audit;
  }

  /** Effective provider (cache-wrapped when enabled). */
  private get _readProvider(): SecretProvider {
    return this._cache ?? this._provider;
  }

  // --------------------------------------------------------------- secrets CRUD

  async get(path: string, ctx?: SecretContext): Promise<string> {
    const principal = ctx?.principal ?? this._defaultPrincipal;
    const wasCached = this._cache !== null && this._cache.stats() !== undefined;
    void wasCached;
    const before = this._cache?.stats();
    const read = await this._readProvider.get(path);
    const after = this._cache?.stats();
    if (before && after && after.hits > before.hits) {
      this._audit.record('cache-hit', path, principal, true);
    } else if (before && after) {
      this._audit.record('cache-miss', path, principal, true);
    }
    if (read === undefined) {
      this._audit.record('read', path, principal, false, 'not found');
      throw new SecretError(SecretErrorCode.NOT_FOUND, `secret '${path}' not found`);
    }
    this._audit.record('read', path, principal, true, `v${read.version}`);
    return read.value;
  }

  /** Read, returning undefined instead of throwing. */
  async tryGet(path: string, ctx?: SecretContext): Promise<string | undefined> {
    const principal = ctx?.principal ?? this._defaultPrincipal;
    const read = await this._readProvider.get(path);
    this._audit.record('read', path, principal, read !== undefined, read === undefined ? 'not found' : `v${read.version}`);
    return read?.value;
  }

  async getVersion(path: string, version: number, ctx?: SecretContext): Promise<string> {
    const principal = ctx?.principal ?? this._defaultPrincipal;
    try {
      const read = await this._readProvider.getVersion(path, version);
      if (read === undefined) {
        this._audit.record('read-version', path, principal, false, `v${version} missing`);
        throw new SecretError(SecretErrorCode.VERSION_NOT_FOUND, `${path}@v${version} not found`);
      }
      this._audit.record('read-version', path, principal, true, `v${version}`);
      return read.value;
    } catch (e) {
      if (e instanceof SecretError) {
        this._audit.record('read-version', path, principal, false, e.code);
      }
      throw e;
    }
  }

  /** Store a new version. Returns the version number. */
  async put(path: string, value: string, ctx?: SecretContext, metadata?: Record<string, string>): Promise<number> {
    const principal = ctx?.principal ?? this._defaultPrincipal;
    const v = await this._provider.put(path, value, principal, metadata);
    if (this._cache) {
      this._cache.invalidate(path);
    }
    this._audit.record('write', path, principal, true, `v${v}`);
    return v;
  }

  /**
   * Rotate `path`: store `newValue` and return the new version plus the old
   * version number that remains readable inside the grace window.
   */
  async rotate(path: string, newValue: string, ctx?: SecretContext): Promise<{ newVersion: number; previousVersion: number | undefined }> {
    const principal = ctx?.principal ?? this._defaultPrincipal;
    const versions = await this._provider.versions(path);
    const previous = versions.length > 0 ? versions[versions.length - 1] : undefined;
    const newVersion = await this.put(path, newValue, ctx);
    this._audit.record('rotate', path, principal, true, `v${previous ?? '-'} → v${newVersion}`);
    return { newVersion, previousVersion: previous };
  }

  async delete(path: string, ctx?: SecretContext): Promise<boolean> {
    const principal = ctx?.principal ?? this._defaultPrincipal;
    const ok = await this._provider.delete(path);
    if (this._cache) this._cache.invalidate(path);
    this._audit.record('delete', path, principal, ok);
    return ok;
  }

  async list(pattern: string, ctx?: SecretContext): Promise<ReadonlyArray<string>> {
    const principal = ctx?.principal ?? this._defaultPrincipal;
    const out = await this._provider.list(pattern);
    this._audit.record('list', pattern, principal, true, `${out.length} match(es)`);
    return out;
  }

  async versions(path: string): Promise<ReadonlyArray<number>> {
    return this._provider.versions(path);
  }

  // -------------------------------------------------------------------- leases

  issueLease(path: string, ttlMs: number, ctx?: SecretContext, maxTtlMs?: number): SecretLease {
    const principal = ctx?.principal ?? this._defaultPrincipal;
    const lease = this._leases.issue(path, {
      ttlMs,
      ...(maxTtlMs !== undefined ? { maxTtlMs } : {}),
    });
    this._audit.record('lease-issue', path, principal, true, `${lease.leaseId} ttl=${ttlMs}`);
    return lease;
  }

  renewLease(leaseId: string, extendMs: number, ctx?: SecretContext): SecretLease {
    const principal = ctx?.principal ?? this._defaultPrincipal;
    const lease = this._leases.renew(leaseId, extendMs);
    this._audit.record('lease-renew', lease.path, principal, true, `${leaseId} → ${lease.expiresAt}`);
    return lease;
  }

  revokeLease(leaseId: string, ctx?: SecretContext): void {
    const principal = ctx?.principal ?? this._defaultPrincipal;
    this._leases.revoke(leaseId);
    this._audit.record('lease-revoke', leaseId, principal, true);
  }

  // ------------------------------------------------------------ materialization

  /**
   * Expand `${secret:path}` and `${secret:path@version}` references in a
   * template — the bridge from config interpolation into the vault.
   * Unresolved references are left in place (matching the config
   * interpolator's semantics); failures are audited.
   */
  async materialize(template: string, ctx?: SecretContext): Promise<string> {
    const principal = ctx?.principal ?? this._defaultPrincipal;
    const matches = [...template.matchAll(SECRET_REF_RE)];
    if (matches.length === 0) return template;

    const replacements = await Promise.all(
      matches.map(async (m) => {
        const spec = m[1].trim();
        const atIdx = spec.lastIndexOf('@');
        const path = atIdx === -1 ? spec : spec.slice(0, atIdx);
        const versionStr = atIdx === -1 ? undefined : spec.slice(atIdx + 1);
        try {
          if (versionStr !== undefined) {
            const v = Number(versionStr);
            if (!Number.isInteger(v) || v < 1) throw new SecretError(SecretErrorCode.VERSION_NOT_FOUND, `bad version '${versionStr}'`);
            return { raw: m[0], value: await this.getVersion(path, v, { principal }) };
          }
          return { raw: m[0], value: await this.get(path, { principal }) };
        } catch {
          this._audit.record('read', path, principal, false, 'materialize failed');
          return { raw: m[0], value: m[0] };
        }
      })
    );

    let out = template;
    for (const r of replacements) out = out.split(r.raw).join(r.value);
    return out;
  }

  // ------------------------------------------------------------------ reporting

  audit(q: AuditQuery = {}): AuditEntry[] {
    return this._audit.query(q);
  }

  cacheStats(): SecretCacheStats | undefined {
    return this._cache?.stats();
  }

  /** Lazy expiry sweep for the provider + leases. */
  sweep(): void {
    this._leases.sweep();
    const p = this._provider as { sweepExpired?: () => number };
    p.sweepExpired?.();
  }
}
