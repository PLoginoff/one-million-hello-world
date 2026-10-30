/**
 * Decision Cache
 *
 * Caches AccessDecisions keyed by (subjectId, resourceId, action,
 * environment-fingerprint). Environment attributes only participate
 * when ABAC policies exist — a fingerprint of the environment map is
 * mixed into the key.
 *
 * LRU eviction via Map insertion-order semantics (re-set on hit).
 * Invalidation is version-stamped: bumping the authz graph version
 * invalidates all entries lazily — entries carry the version they
 * were computed under, so a stale entry never serves.
 *
 * O(1) lookup, O(1) insert, O(1) eviction.
 *
 * @module AuthorizationLayer/Engine
 */

import { AccessDecision } from './types';

interface CacheEntry {
  decision: AccessDecision;
  graphVersion: number;
  expiresAt: number;
}

export interface DecisionCacheConfig {
  readonly capacity?: number;
  readonly ttlMs?: number;
}

const DEFAULT_CAPACITY = 10_000;
const DEFAULT_TTL_MS = 60_000;

/** Stable fingerprint of an environment object. */
export function environmentFingerprint(env: Record<string, unknown> | undefined): string {
  if (!env) return '-';
  const keys = Object.keys(env).sort();
  const parts = keys.map((k) => {
    const v = env[k];
    const sv = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `${k}=${sv}`;
  });
  return parts.join('&');
}

export function decisionKey(
  subjectId: string,
  resource: { id: string; ownerId?: string; attributes?: Record<string, unknown> },
  action: string,
  env: Record<string, unknown> | undefined
): string {
  // Owner and attributes participate in the key: two resources with
  // the same id but different ABAC state must not share a verdict.
  const resFp = `${resource.ownerId ?? ''}#${environmentFingerprint(resource.attributes)}`;
  return `${subjectId}|${resource.id}|${resFp}|${action}|${environmentFingerprint(env)}`;
}

export class DecisionCache {
  private _map: Map<string, CacheEntry>;
  private _capacity: number;
  private _ttlMs: number;
  private _hits = 0;
  private _misses = 0;

  constructor(config?: DecisionCacheConfig) {
    this._map = new Map();
    this._capacity = Math.max(1, config?.capacity ?? DEFAULT_CAPACITY);
    this._ttlMs = config?.ttlMs ?? DEFAULT_TTL_MS;
  }

  get(key: string, graphVersion: number, now: number): AccessDecision | undefined {
    const e = this._map.get(key);
    if (!e) {
      this._misses++;
      return undefined;
    }
    if (e.graphVersion !== graphVersion || e.expiresAt <= now) {
      this._map.delete(key);
      this._misses++;
      return undefined;
    }
    // LRU touch: delete+set moves to the newest position.
    this._map.delete(key);
    this._map.set(key, e);
    this._hits++;
    return e.decision;
  }

  set(key: string, decision: AccessDecision, graphVersion: number, now: number): void {
    if (this._map.size >= this._capacity) {
      // Evict oldest (first key in insertion order).
      const oldest = this._map.keys().next().value;
      if (oldest !== undefined) this._map.delete(oldest);
    }
    this._map.set(key, {
      decision,
      graphVersion,
      expiresAt: now + this._ttlMs,
    });
  }

  /** Invalidate all entries mentioning a subject (e.g. role change). */
  invalidateSubject(subjectId: string): number {
    let n = 0;
    for (const key of this._map.keys()) {
      if (key.split('|')[0] === subjectId) {
        this._map.delete(key);
        n++;
      }
    }
    return n;
  }

  /** Invalidate all entries mentioning a resource. */
  invalidateResource(resourceId: string): number {
    let n = 0;
    for (const key of this._map.keys()) {
      if (key.split('|')[1] === resourceId) {
        this._map.delete(key);
        n++;
      }
    }
    return n;
  }

  clear(): void {
    this._map.clear();
  }

  stats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this._hits + this._misses;
    return {
      size: this._map.size,
      hits: this._hits,
      misses: this._misses,
      hitRate: total === 0 ? 0 : this._hits / total,
    };
  }
}
