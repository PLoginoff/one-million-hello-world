/**
 * Secrets Rotation — Secret Usage Tracking
 *
 * Records which services consume which secrets — the operational
 * prerequisite for safe rotation:
 *
 *  - `recordAccess(secretId, serviceId)` — a heartbeat each time a service
 *    reads a secret. Per-(secret, service) the tracker keeps first/last
 *    seen timestamps, an access counter, and the key generation observed
 *    (so we can detect consumers still on retired material).
 *  - `consumersOf(secretId)` — blast radius: every service that has read
 *    this secret, freshest first.
 *  - `secretsUsedBy(serviceId)` — a service's secret footprint; what must
 *    it re-fetch after rotations.
 *  - `staleConsumers(secretId, currentGeneration)` — services whose last
 *    observed generation lags the current one: the list that must reload
 *    before the old key's grace window may safely end.
 *  - `idleSecrets(idleMs)` — secrets not accessed for `idleMs` — rotation
 *    candidates for decommission, or services that cache aggressively.
 *  - `report()` — per-secret usage summary for dashboards/auditing.
 *
 * Pure in-memory store; the injectable clock makes idle detection
 * deterministic in tests.
 *
 * @module SecretsRotation/Engine2
 */

import { RotationClock } from '../rotation/RotationTypes';

export interface AccessEvent {
  readonly secretId: string;
  readonly serviceId: string;
  /** Key generation the consumer observed (if known). */
  readonly generation?: number;
  readonly at: number;
}

export interface ConsumerRecord {
  readonly serviceId: string;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly accesses: number;
  /** Most recent generation this consumer was seen using. */
  readonly lastGeneration?: number;
  /** All generations ever observed from this consumer. */
  readonly generations: ReadonlySet<number>;
}

export interface SecretUsageReport {
  readonly secretId: string;
  readonly consumers: number;
  readonly totalAccesses: number;
  readonly lastAccessAt: number;
  /** Distinct generations currently in use across consumers. */
  readonly activeGenerations: ReadonlyArray<number>;
}

interface MutableConsumerRecord {
  firstSeenAt: number;
  lastSeenAt: number;
  accesses: number;
  lastGeneration?: number;
  generations: Set<number>;
}

export class SecretUsageTracker {
  private readonly _clock: RotationClock;
  /** secretId → serviceId → record */
  private readonly _bySecret = new Map<string, Map<string, MutableConsumerRecord>>();
  /** serviceId → set of secretIds */
  private readonly _byService = new Map<string, Set<string>>();
  /** Bounded access log for auditing. */
  private readonly _log: AccessEvent[] = [];
  private readonly _maxLog: number;

  constructor(options: { clock?: RotationClock; maxLog?: number } = {}) {
    this._clock = options.clock ?? Date.now;
    this._maxLog = options.maxLog ?? 100_000;
  }

  /** Record one secret read by a service. */
  recordAccess(secretId: string, serviceId: string, generation?: number): void {
    const at = this._clock();
    let byService = this._bySecret.get(secretId);
    if (!byService) {
      byService = new Map();
      this._bySecret.set(secretId, byService);
    }
    let rec = byService.get(serviceId);
    if (!rec) {
      rec = { firstSeenAt: at, lastSeenAt: at, accesses: 0, generations: new Set() };
      byService.set(serviceId, rec);
    }
    rec.lastSeenAt = at;
    rec.accesses++;
    if (generation !== undefined) {
      rec.lastGeneration = generation;
      rec.generations.add(generation);
    }

    let services = this._byService.get(serviceId);
    if (!services) {
      services = new Set();
      this._byService.set(serviceId, services);
    }
    services.add(secretId);

    this._log.push({ secretId, serviceId, generation, at });
    if (this._log.length > this._maxLog) {
      this._log.splice(0, this._log.length - this._maxLog);
    }
  }

  /** All services that have ever read `secretId`, freshest first. */
  consumersOf(secretId: string): ReadonlyArray<ConsumerRecord> {
    const m = this._bySecret.get(secretId);
    if (!m) return [];
    return [...m.entries()]
      .map(([serviceId, r]) => ({
        serviceId,
        firstSeenAt: r.firstSeenAt,
        lastSeenAt: r.lastSeenAt,
        accesses: r.accesses,
        lastGeneration: r.lastGeneration,
        generations: r.generations,
      }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  /** All secrets a service has read. */
  secretsUsedBy(serviceId: string): ReadonlyArray<string> {
    return [...(this._byService.get(serviceId) ?? new Set<string>())];
  }

  /**
   * Services whose last observed generation of `secretId` is BEHIND
   * `currentGeneration` — they must reload before grace can safely end.
   * Consumers with no recorded generation are treated as stale (unknown
   * is unsafe).
   */
  staleConsumers(secretId: string, currentGeneration: number): ReadonlyArray<ConsumerRecord> {
    return this.consumersOf(secretId).filter(
      (c) => c.lastGeneration === undefined || c.lastGeneration < currentGeneration
    );
  }

  /**
   * Is it safe to fully retire generation `oldGen` of `secretId`?
   * True when no consumer was seen on `oldGen` within `withinMs`.
   * A consumer seen on the old gen longer ago than `withinMs` is presumed
   * to have rotated — or died, in which case retirement is still safe.
   */
  safeToRetire(secretId: string, oldGen: number, withinMs: number): boolean {
    const now = this._clock();
    for (const c of this.consumersOf(secretId)) {
      const stillOnOld = c.lastGeneration === oldGen && now - c.lastSeenAt <= withinMs;
      if (stillOnOld) return false;
    }
    return true;
  }

  /**
   * Secrets with no access in the last `idleMs`. Unknown secrets aren't
   * returned (the tracker only reports what it has seen).
   */
  idleSecrets(idleMs: number): ReadonlyArray<string> {
    const now = this._clock();
    const out: string[] = [];
    for (const [secretId, m] of this._bySecret) {
      const last = Math.max(...[...m.values()].map((r) => r.lastSeenAt));
      if (now - last > idleMs) out.push(secretId);
    }
    return out;
  }

  /** Per-secret usage summary. */
  report(): ReadonlyArray<SecretUsageReport> {
    const out: SecretUsageReport[] = [];
    for (const [secretId, m] of this._bySecret) {
      let total = 0;
      let last = 0;
      const gens = new Set<number>();
      for (const r of m.values()) {
        total += r.accesses;
        last = Math.max(last, r.lastSeenAt);
        for (const g of r.generations) gens.add(g);
      }
      out.push({
        secretId,
        consumers: m.size,
        totalAccesses: total,
        lastAccessAt: last,
        activeGenerations: [...gens].sort((a, b) => a - b),
      });
    }
    return out.sort((a, b) => a.secretId.localeCompare(b.secretId));
  }

  /** Raw access log tail (bounded). */
  recentAccesses(limit = 100): ReadonlyArray<AccessEvent> {
    return this._log.slice(-limit);
  }

  reset(): void {
    this._bySecret.clear();
    this._byService.clear();
    this._log.length = 0;
  }
}
