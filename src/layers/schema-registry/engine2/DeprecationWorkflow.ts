/**
 * DeprecationWorkflow — schema version sunset management.
 *
 * Removing a schema version consumers still read is a breaking
 * production change. The workflow formalizes the sunset lifecycle:
 *
 *   DEPRECATE(subject, version, sunsetAt, notice?)
 *     ↓  consumers notified (pluggable notifier), version flagged
 *   SUNSET  — at sunsetAt the version is eligible for removal
 *   REMOVE  — enforcement: only when zero ACTIVE consumers remain
 *
 * Integration points:
 *   - UsageTracker supplies "who still uses it" for safe-removal checks
 *   - a `DeprecationNotifier` delivers migration notices to consumers
 *   - `enforce()` transitions sunset-due versions and refuses removal
 *     while active consumers remain (returns a report, not exceptions)
 *
 * Grace model: deprecated-but-not-sunset versions still serve reads;
 * sunset versions are candidates for `deleteVersion` once consumers
 * drain.
 *
 * @module SchemaRegistry/Engine2
 */

import type { SchemaRegistryEngine } from '../registry/SchemaRegistryEngine';
import type { UsageTracker } from './UsageTracker';

// ------------------------------------------------------------------ types

/** Lifecycle states for a deprecating version. */
export enum SunsetState {
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  SUNSET_DUE = 'sunset_due',
  REMOVED = 'removed',
  /** Sunset blocked — active consumers remain. */
  BLOCKED = 'blocked',
}

/** Deprecation record for one (subject, version). */
export interface Deprecation {
  readonly subject: string;
  readonly version: number;
  readonly deprecatedAt: number;
  /** Epoch ms when removal becomes permitted. */
  readonly sunsetAt: number;
  /** Human-readable migration notice. */
  readonly notice?: string;
  /** Replacement suggestion (e.g. 'v5'). */
  readonly replacement?: string;
  state: SunsetState;
  /** Consumers notified about this deprecation. */
  readonly notified: string[];
  removedAt?: number;
}

/** Notify a consumer a version is going away. */
export type DeprecationNotifier = (
  consumerId: string,
  subject: string,
  version: number,
  sunsetAt: number,
  notice?: string,
) => void;

/** Result of an enforcement pass. */
export interface EnforcementReport {
  readonly checked: number;
  readonly sunsetDue: Deprecation[];
  readonly removed: Deprecation[];
  readonly blocked: Array<{ deprecation: Deprecation; activeConsumers: string[] }>;
}

// ------------------------------------------------------------------ workflow

export class DeprecationWorkflow {
  private readonly _engine: SchemaRegistryEngine;
  private readonly _usage: UsageTracker;
  private readonly _notifier?: DeprecationNotifier;
  private readonly _now: () => number;
  private readonly _deprecations = new Map<string, Deprecation>();

  constructor(
    engine: SchemaRegistryEngine,
    usage: UsageTracker,
    notifier?: DeprecationNotifier,
    now: () => number = Date.now,
  ) {
    this._engine = engine;
    this._usage = usage;
    this._notifier = notifier;
    this._now = now;
  }

  private static _key(subject: string, version: number): string {
    return `${subject}|${version}`;
  }

  /**
   * Deprecate a version. Notifies every consumer the tracker has ever
   * seen for this version (active or not — stale consumers still need
   * the notice before they next start).
   */
  deprecate(subject: string, version: number, sunsetInMs: number, options: { notice?: string; replacement?: string } = {}): Deprecation {
    const key = DeprecationWorkflow._key(subject, version);
    if (this._deprecations.has(key)) {
      throw new Error(`${subject}@${version} already deprecated`);
    }
    // Verify the version exists.
    this._engine.getVersion(subject, version);

    const now = this._now();
    const dep: Deprecation = {
      subject,
      version,
      deprecatedAt: now,
      sunsetAt: now + sunsetInMs,
      notice: options.notice,
      replacement: options.replacement,
      state: SunsetState.DEPRECATED,
      notified: [],
    };

    // Notify all known consumers.
    const usage = this._usage.usageOf(subject, version);
    const targets = usage?.allConsumers ?? [];
    for (const consumerId of targets) {
      try {
        this._notifier?.(consumerId, subject, version, dep.sunsetAt, options.notice);
        dep.notified.push(consumerId);
      } catch {
        // Notifier failure shouldn't block deprecation — record silently.
      }
    }

    this._deprecations.set(key, dep);
    return dep;
  }

  /** Current record for a version. */
  deprecation(subject: string, version: number): Deprecation | undefined {
    return this._deprecations.get(DeprecationWorkflow._key(subject, version));
  }

  /**
   * Enforcement pass: transition due deprecations to SUNSET_DUE and
   * remove those with no active consumers.
   *
   * Removal is gated on `UsageTracker.activeConsumersOf` — a version
   * with any live consumer reports BLOCKED, never removed.
   */
  enforce(hardDelete = false): EnforcementReport {
    const now = this._now();
    const sunsetDue: Deprecation[] = [];
    const removed: Deprecation[] = [];
    const blocked: EnforcementReport['blocked'] = [];

    for (const dep of this._deprecations.values()) {
      if (dep.state === SunsetState.REMOVED || dep.state === SunsetState.SUNSET_DUE || dep.state === SunsetState.BLOCKED) {
        continue;
      }
      if (now < dep.sunsetAt) continue;

      dep.state = SunsetState.SUNSET_DUE;
      sunsetDue.push(dep);

      const active = this._usage.activeConsumersOf(dep.subject, dep.version);
      if (active.length > 0) {
        dep.state = SunsetState.BLOCKED;
        blocked.push({ deprecation: dep, activeConsumers: active });
        continue;
      }

      // Safe to remove — soft-delete the version (or hard when asked).
      try {
        if (hardDelete) {
          this._engine.deleteVersion(dep.subject, dep.version);
        } else {
          this._engine.deleteVersion(dep.subject, dep.version);
        }
        dep.state = SunsetState.REMOVED;
        dep.removedAt = now;
        removed.push(dep);
      } catch {
        dep.state = SunsetState.BLOCKED;
        blocked.push({ deprecation: dep, activeConsumers: [] });
      }
    }

    return { checked: this._deprecations.size, sunsetDue, removed, blocked };
  }

  /**
   * Is a version sunset-blocked, deprecated, or clean? Callers (schema
   * fetch paths) use this to warn consumers on read.
   */
  statusOf(subject: string, version: number): { state: SunsetState; sunsetAt?: number; notice?: string } {
    const dep = this._deprecations.get(DeprecationWorkflow._key(subject, version));
    if (!dep) return { state: SunsetState.ACTIVE };
    return { state: dep.state, sunsetAt: dep.sunsetAt, notice: dep.notice };
  }

  /** All deprecations — dashboard feed. */
  all(): Deprecation[] {
    return [...this._deprecations.values()];
  }
}
