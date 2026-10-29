/**
 * MetadataRefresher — scheduled partner-metadata refresh with
 * exponential-backoff failure handling.
 *
 * Real federation deployments refresh partner metadata on a timer,
 * honoring `cacheDuration`/`validUntil` and degrading gracefully when
 * the partner is unreachable (use the last-good document while it is
 * still inside its validity window, alert when stale).
 *
 * This component models the refresh *policy*:
 *  - `dueEntities` — which trusts need refresh now (lastSuccess +
 *    interval elapsed, or lastFailure + backoff elapsed)
 *  - `reportSuccess` — store the refreshed document, reset failure
 *    count and backoff
 *  - `reportFailure` — increment failure count; next refresh delayed
 *    by min(cap, base * 2^failures); marks document STALE when past
 *    validUntil so the engine can refuse assertions from it
 *
 * The actual fetch is injected — this class owns scheduling state and
 * staleness decisions, keeping network concerns out.
 *
 * @module IdentityProvider/Federation
 */

import { EntityMetadata } from './types';

export interface RefreshState {
  entityId: string;
  /** Consecutive refresh failures. */
  failures: number;
  /** Last successful refresh (epoch ms); 0 = never. */
  lastSuccessAt: number;
  /** Last failure (epoch ms). */
  lastFailureAt?: number;
  /** Currently-held document's expiry. */
  validUntil?: number;
  /** True when the held document is past validUntil. */
  stale: boolean;
}

export interface RefresherConfig {
  /** Normal refresh interval ms. */
  intervalMs: number;
  /** Failure backoff base ms. */
  failureBaseMs: number;
  /** Failure backoff cap ms. */
  failureCapMs: number;
}

const DEFAULTS: RefresherConfig = {
  intervalMs: 60 * 60 * 1000,
  failureBaseMs: 30_000,
  failureCapMs: 30 * 60 * 1000,
};

export class MetadataRefresher {
  private readonly _config: RefresherConfig;
  private readonly _states: Map<string, RefreshState> = new Map();

  constructor(config?: Partial<RefresherConfig>) {
    this._config = { ...DEFAULTS, ...config };
  }

  /** Begin tracking an entity. */
  track(entityId: string, validUntil?: number): void {
    if (!this._states.has(entityId)) {
      this._states.set(entityId, {
        entityId, failures: 0, lastSuccessAt: 0, validUntil, stale: false,
      });
    }
  }

  untrack(entityId: string): boolean {
    return this._states.delete(entityId);
  }

  state(entityId: string): RefreshState | undefined {
    const s = this._states.get(entityId);
    return s ? { ...s } : undefined;
  }

  /**
   * Entities due for refresh at `now`: never-refreshed, normal-interval
   * elapsed since last success, or failure-backoff elapsed.
   */
  dueEntities(now: number = Date.now()): string[] {
    const out: string[] = [];
    for (const s of this._states.values()) {
      if (s.failures === 0) {
        // Never refreshed -> due immediately; else on the normal interval.
        if (s.lastSuccessAt === 0 || now - s.lastSuccessAt >= this._config.intervalMs) out.push(s.entityId);
      } else {
        const backoff = Math.min(this._config.failureCapMs, this._config.failureBaseMs * 2 ** (s.failures - 1));
        if (now - (s.lastFailureAt ?? 0) >= backoff) out.push(s.entityId);
      }
    }
    return out;
  }

  /** Record a successful refresh; installs the new validUntil. */
  reportSuccess(entityId: string, metadata: EntityMetadata, now: number = Date.now()): void {
    this.track(entityId, metadata.validUntil);
    const s = this._states.get(entityId)!;
    s.failures = 0;
    // Treat a success at epoch 0 as "just refreshed" — use a sentinel
    // so the never-refreshed check (=== 0) doesn't immediately re-due it.
    s.lastSuccessAt = Math.max(1, now);
    s.lastFailureAt = undefined;
    s.validUntil = metadata.validUntil;
    s.stale = false;
  }

  /** Record a failed refresh attempt; updates staleness flag. */
  reportFailure(entityId: string, now: number = Date.now()): void {
    this.track(entityId);
    const s = this._states.get(entityId)!;
    s.failures++;
    s.lastFailureAt = now;
    if (s.validUntil !== undefined && now > s.validUntil) s.stale = true;
  }

  /** Entities whose held documents are past validUntil. */
  staleEntities(now: number = Date.now()): string[] {
    const out: string[] = [];
    for (const s of this._states.values()) {
      if (s.validUntil !== undefined && now > s.validUntil) {
        s.stale = true;
        out.push(s.entityId);
      }
    }
    return out;
  }
}
