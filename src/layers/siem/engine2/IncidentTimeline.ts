/**
 * Incident Timeline — group related events into reconstructed threads.
 *
 * Clustering is entity-based union-find: events are linked when they
 * share a pivot entity (user, source IP, dest IP, host) inside a
 * sliding co-occurrence window. Once linked, events merge into the
 * same incident regardless of distance — an attacker's whole session
 * comes together as one thread.
 *
 * Algorithm:
 *   1. bucket events per entity value (user:X, ip:Y, host:Z)
 *   2. within each bucket, union events whose timestamps are within
 *      `linkWindowMs` of a bucket-mate
 *   3. each union-find component with ≥ minSize events = one Incident
 *
 * O(E) unions over O(E) events — path-halving find keeps it linear.
 *
 * @module SiemLayer/Engine2
 */

import { NormalizedEvent } from '../engine/EventNormalizer';
import { Incident, TimelineLink } from './types';

const SEVERITY_RANK: Record<string, number> = {
  debug: 0, info: 1, notice: 2, warning: 3, err: 4, crit: 5, alert: 6, emerg: 7,
};

export interface TimelineConfig {
  /** Max time gap between two same-entity events that still links them. */
  readonly linkWindowMs: number;
  /** Minimum cluster size to report as an incident. */
  readonly minIncidentSize: number;
}

export const DEFAULT_TIMELINE_CONFIG: TimelineConfig = {
  linkWindowMs: 30 * 60_000,
  minIncidentSize: 3,
};

/** Union-find with path halving. */
class DisjointSet {
  private readonly _parent: number[];
  constructor(n: number) {
    this._parent = new Array<number>(n);
    for (let i = 0; i < n; i++) this._parent[i] = i;
  }
  find(x: number): number {
    let r = x;
    while (this._parent[r] !== r) r = this._parent[r];
    // Path halving.
    while (this._parent[x] !== r) {
      const next = this._parent[x];
      this._parent[x] = r;
      x = next;
    }
    return r;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this._parent[rb] = ra;
  }
}

export class IncidentTimeline {
  private readonly _config: TimelineConfig;

  constructor(config: TimelineConfig = DEFAULT_TIMELINE_CONFIG) {
    this._config = config;
  }

  /**
   * Cluster an event set into incidents. `events` should be a bounded
   * window (e.g. last N hours) — union-find scales linearly but the
   * entity buckets are the real bound.
   */
  reconstruct(events: ReadonlyArray<NormalizedEvent>): Incident[] {
    if (events.length === 0) return [];
    const sorted = [...events].sort((a, b) => a.timestampMs - b.timestampMs);
    const ds = new DisjointSet(sorted.length);
    const links: TimelineLink[] = [];

    // entity-value → list of event indices sharing it
    const buckets = new Map<string, number[]>();
    const push = (entity: string | undefined, idx: number): void => {
      if (!entity) return;
      const list = buckets.get(entity) ?? [];
      list.push(idx);
      buckets.set(entity, list);
    };
    sorted.forEach((e, i) => {
      push(e.user && `user:${e.user}`, i);
      push(e.sourceIp && `srcip:${e.sourceIp}`, i);
      push(e.destIp && `dstip:${e.destIp}`, i);
      push(e.sourceHost && `host:${e.sourceHost}`, i);
    });

    // Union chain-adjacent same-entity events within the link window.
    const linkReason = (entityKey: string): TimelineLink['reason'] =>
      entityKey.startsWith('user:') ? 'same-user'
      : entityKey.startsWith('srcip:') ? 'same-src-ip'
      : entityKey.startsWith('dstip:') ? 'same-dest-ip'
      : 'same-host';
    for (const [entityKey, idxs] of buckets) {
      idxs.sort((a, b) => sorted[a].timestampMs - sorted[b].timestampMs);
      for (let i = 1; i < idxs.length; i++) {
        const a = sorted[idxs[i - 1]];
        const b = sorted[idxs[i]];
        if (b.timestampMs - a.timestampMs <= this._config.linkWindowMs) {
          ds.union(idxs[i - 1], idxs[i]);
          links.push({ fromEventId: a.id, toEventId: b.id, reason: linkReason(entityKey) });
        }
      }
    }

    // Collect components.
    const groups = new Map<number, number[]>();
    for (let i = 0; i < sorted.length; i++) {
      const root = ds.find(i);
      const list = groups.get(root) ?? [];
      list.push(i);
      groups.set(root, list);
    }

    const out: Incident[] = [];
    let seq = 0;
    for (const members of groups.values()) {
      if (members.length < this._config.minIncidentSize) continue;
      seq += 1;
      const evs = members.map((i) => sorted[i]).sort((a, b) => a.timestampMs - b.timestampMs);
      const pivots = this._pivotEntities(evs);
      let maxSev = 'info';
      for (const e of evs) {
        if ((SEVERITY_RANK[e.severity] ?? 0) > (SEVERITY_RANK[maxSev] ?? 0)) maxSev = e.severity;
      }
      out.push({
        id: `inc-${seq}`,
        anchorEventIds: [evs[0].id, evs[evs.length - 1].id],
        events: evs,
        startedMs: evs[0].timestampMs,
        endedMs: evs[evs.length - 1].timestampMs,
        pivotEntities: pivots,
        severity: maxSev,
      });
    }
    out.sort((a, b) => b.endedMs - a.endedMs);
    return out;
  }

  /** The entities shared by the largest fraction of member events. */
  private _pivotEntities(events: ReadonlyArray<NormalizedEvent>): string[] {
    const counts = new Map<string, number>();
    for (const e of events) {
      if (e.user) counts.set(`user:${e.user}`, (counts.get(`user:${e.user}`) ?? 0) + 1);
      if (e.sourceIp) counts.set(`srcip:${e.sourceIp}`, (counts.get(`srcip:${e.sourceIp}`) ?? 0) + 1);
      if (e.destIp) counts.set(`dstip:${e.destIp}`, (counts.get(`dstip:${e.destIp}`) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= Math.ceil(events.length / 2))
      .map(([k]) => k)
      .sort();
  }
}
