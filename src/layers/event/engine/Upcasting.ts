/**
 * Upcaster registry — schema evolution on read.
 *
 * Events are immutable and permanent; their schema isn't. When an event's
 * payload shape changes, we DON'T rewrite the log — we register *upcasters*
 * that migrate `v(n) → v(n+1)` lazily at read time:
 *
 *   UserRegistered v1: { name }
 *   UserRegistered v2: { name, email }          upcaster adds email=null
 *   UserRegistered v3: { name, contact:{email} } upcaster nests the field
 *
 * A chain `v1 → v2 → v3` composes automatically: registered per-step
 * functions apply in sequence. This is the EventSourcingDB/Axon pattern —
 * the log stays truthful, reads see the latest shape.
 *
 * Lookup is O(chain length); chains are short by construction.
 *
 * @module EventLayer/Engine
 */

import { EventEnvelopeMeta, StoredEngineEvent, Upcaster } from './types';

interface UpcasterKey {
  readonly type: string;
  readonly fromVersion: number;
}

export class UpcasterRegistry {
  /** (type, fromVersion) → upcaster producing version fromVersion+1. */
  private readonly steps = new Map<string, Upcaster>();

  private key(k: UpcasterKey): string {
    return `${k.type}@${k.fromVersion}`;
  }

  /**
   * Registers a single-version migration for `type`.
   * Chains must be contiguous — register (1→2) then (2→3), not (1→3).
   */
  register(type: string, fromVersion: number, upcast: Upcaster): this {
    if (this.steps.has(this.key({ type, fromVersion }))) {
      throw new Error(`Duplicate upcaster for ${type} v${fromVersion}`);
    }
    this.steps.set(this.key({ type, fromVersion }), upcast);
    return this;
  }

  /** True when `type`@`version` has a registered step up. */
  has(type: string, version: number): boolean {
    return this.steps.has(this.key({ type, fromVersion: version }));
  }

  /** Latest reachable schema version for `type` starting at `version`. */
  latestVersion(type: string, version: number): number {
    let v = version;
    while (this.steps.has(this.key({ type, fromVersion: v }))) v++;
    return v;
  }

  /**
   * Migrates `data` from `fromVersion` to the newest reachable version.
   * Missing links stop the chain (partial upgrade rather than failure —
   * readers still get the best available shape).
   */
  upcast(type: string, fromVersion: number, data: unknown, meta: EventEnvelopeMeta): unknown {
    let v = fromVersion;
    let out = data;
    let guard = 0;
    const MAX_STEPS = 100; // defensive: a cyclic chain would loop forever
    while (guard++ < MAX_STEPS) {
      const step = this.steps.get(this.key({ type, fromVersion: v }));
      if (!step) break;
      out = step(out, meta);
      v++;
    }
    return out;
  }

  /** Returns a copy of `event` with `data` upcast and schemaVersion updated. */
  upcastEvent(event: StoredEngineEvent): StoredEngineEvent {
    const target = this.latestVersion(event.type, event.schemaVersion);
    if (target === event.schemaVersion) return event;
    return {
      ...event,
      schemaVersion: target,
      data: this.upcast(event.type, event.schemaVersion, event.data, event.meta),
    };
  }
}
