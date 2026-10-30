/**
 * UsageTracker — which consumers use which schema versions.
 *
 * A registry knows WHAT versions exist; operations needs to know WHO
 * reads them — "is anyone still on v1?", "which consumers must migrate
 * before we delete v2?", "what's the adoption curve of v3?".
 *
 * Consumers report their (subject, version) sightings with a timestamp.
 * The tracker maintains:
 *
 *   - per-(subject,version): set of consumers, last-seen time
 *   - per-consumer: set of (subject,version) currently in use
 *   - adoption curve: first-seen → last-seen per version
 *
 * Staleness: a consumer not seen for `staleAfterMs` drops out of the
 * "active consumer" set — its sightings are kept for history but no
 * longer block deprecations.
 *
 * @module SchemaRegistry/Engine2
 */

// ------------------------------------------------------------------ types

/** A consumer's report that it used a schema version. */
export interface UsageSighting {
  readonly consumerId: string;
  readonly subject: string;
  readonly version: number;
  /** Optional deployment/instance for granularity. */
  readonly instance?: string;
  readonly at: number;
}

/** Per-version consumer rollup. */
export interface VersionUsage {
  readonly subject: string;
  readonly version: number;
  /** Active consumers (seen within staleness window). */
  readonly activeConsumers: string[];
  /** All consumers ever seen. */
  readonly allConsumers: string[];
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly sightings: number;
}

/** Per-consumer rollup. */
export interface ConsumerUsage {
  readonly consumerId: string;
  /** (subject, version) pairs currently reported. */
  readonly versions: Array<{ subject: string; version: number }>;
  readonly lastSeenAt: number;
  readonly stale: boolean;
}

// ------------------------------------------------------------------ tracker

interface VersionRecord {
  consumers: Map<string, number>; // consumerId -> lastSeenAt
  firstSeenAt: number;
  lastSeenAt: number;
  sightings: number;
}

export class UsageTracker {
  /** (subject|version) -> record. */
  private readonly _versions = new Map<string, VersionRecord>();
  /** consumerId -> set of version keys + last activity. */
  private readonly _consumers = new Map<string, { keys: Set<string>; lastSeenAt: number }>();
  private readonly _staleAfterMs: number;
  private readonly _now: () => number;

  constructor(staleAfterMs = 24 * 3600_000, now: () => number = Date.now) {
    this._staleAfterMs = staleAfterMs;
    this._now = now;
  }

  private static _key(subject: string, version: number): string {
    return `${subject}|${version}`;
  }

  /** Record a sighting — idempotent per (consumer, version). */
  report(consumerId: string, subject: string, version: number, at?: number, instance?: string): UsageSighting {
    const t = at ?? this._now();
    const key = UsageTracker._key(subject, version);

    let rec = this._versions.get(key);
    if (!rec) {
      rec = { consumers: new Map(), firstSeenAt: t, lastSeenAt: t, sightings: 0 };
      this._versions.set(key, rec);
    }
    rec.consumers.set(consumerId, t);
    rec.lastSeenAt = Math.max(rec.lastSeenAt, t);
    rec.sightings++;

    let cons = this._consumers.get(consumerId);
    if (!cons) {
      cons = { keys: new Set(), lastSeenAt: t };
      this._consumers.set(consumerId, cons);
    }
    cons.keys.add(key);
    cons.lastSeenAt = Math.max(cons.lastSeenAt, t);
    void instance;

    return { consumerId, subject, version, instance, at: t };
  }

  /** Is this consumer still within the staleness window? */
  isActive(consumerId: string): boolean {
    const c = this._consumers.get(consumerId);
    return c !== undefined && this._now() - c.lastSeenAt < this._staleAfterMs;
  }

  /** Usage rollup for one version. */
  usageOf(subject: string, version: number): VersionUsage | undefined {
    const rec = this._versions.get(UsageTracker._key(subject, version));
    if (!rec) return undefined;
    const now = this._now();
    const active = [...rec.consumers.entries()].filter(([, t]) => now - t < this._staleAfterMs).map(([c]) => c);
    return {
      subject,
      version,
      activeConsumers: active.sort(),
      allConsumers: [...rec.consumers.keys()].sort(),
      firstSeenAt: rec.firstSeenAt,
      lastSeenAt: rec.lastSeenAt,
      sightings: rec.sightings,
    };
  }

  /** Consumers still actively using a version — migration targets. */
  activeConsumersOf(subject: string, version: number): string[] {
    return this.usageOf(subject, version)?.activeConsumers ?? [];
  }

  /** All versions a consumer uses. */
  consumerUsage(consumerId: string): ConsumerUsage | undefined {
    const c = this._consumers.get(consumerId);
    if (!c) return undefined;
    const versions = [...c.keys].map((k) => {
      const [subject, ver] = k.split('|');
      return { subject: subject!, version: parseInt(ver!, 10) };
    });
    return { consumerId, versions, lastSeenAt: c.lastSeenAt, stale: !this.isActive(consumerId) };
  }

  /**
   * Subjects+versions still actively consumed — the set that must NOT
   * be deleted/deprecated without notice.
   */
  activelyUsed(): Array<{ subject: string; version: number; consumers: string[] }> {
    const out: Array<{ subject: string; version: number; consumers: string[] }> = [];
    for (const key of this._versions.keys()) {
      const [subject, ver] = key.split('|');
      const active = this.activeConsumersOf(subject!, parseInt(ver!, 10));
      if (active.length > 0) out.push({ subject: subject!, version: parseInt(ver!, 10), consumers: active });
    }
    return out;
  }

  /** Tracked counts. */
  stats(): { versions: number; consumers: number; activeConsumers: number } {
    let active = 0;
    for (const id of this._consumers.keys()) if (this.isActive(id)) active++;
    return { versions: this._versions.size, consumers: this._consumers.size, activeConsumers: active };
  }
}
