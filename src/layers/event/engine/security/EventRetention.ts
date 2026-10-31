/**
 * EventRetention — retention policies + log compaction.
 *
 * An append-only log grows forever — that's the point. But "forever" and
 * "unbounded disk" aren't compatible, so real event stores offer retention:
 * keep everything a CONSUMER still needs, drop the rest. Three policies,
 * composable per stream:
 *
 *   maxAge      — events older than X are eligible for removal (time tier)
 *   maxCount    — keep only the newest N events per stream (count cap)
 *   compactTo   — keep only the LATEST event per (stream, key-field)
 *                 (log compaction: Kafka's model — old states of an
 *                 entity are redundant once a newer one exists)
 *
 * `evaluate` computes the cut points WITHOUT mutating — the dry-run a real
 * retention job exposes before applying. `apply` does the removal against
 * the store. The EventLog itself is append-only and immutable, so retention
 * works on a separate "materialized stream" view — which is also how real
 * systems treat it (the log is canonical; retention trims derived views).
 *
 * @module EventLayer/Engine/Security
 */

import { StoredEngineEvent } from '../types';

/** One retention policy. */
export interface RetentionPolicy {
  readonly name: string;
  /** Events older than this (ms) are eligible. Undefined = no time limit. */
  readonly maxAgeMs?: number;
  /** Keep at most N newest events per stream. Undefined = unlimited. */
  readonly maxCount?: number;
  /**
   * Compaction key field: keep only the latest event per distinct value of
   * this data-field path (Kafka-style keyed compaction).
   */
  readonly compactKeyField?: string;
}

export interface RetentionEvaluation {
  readonly streamId: string;
  readonly total: number;
  /** Positions (global) that would be removed. */
  readonly eligiblePositions: readonly number[];
  /** Events that survive. */
  readonly retained: readonly StoredEngineEvent[];
}

export class EventRetention {
  private readonly clock: () => number;

  constructor(options: { clock?: () => number } = {}) {
    this.clock = options.clock ?? Date.now;
  }

  /**
   * Evaluates `events` (one stream, oldest→newest) against `policy` —
   * returns which events are eligible for removal. Pure: no mutation.
   *
   * The policies compose by UNION: an event is eligible if ANY rule marks
   * it (maxAge OR over-count OR superseded-by-compaction).
   */
  evaluate(
    streamId: string,
    events: readonly StoredEngineEvent[],
    policy: RetentionPolicy
  ): RetentionEvaluation {
    const eligible = new Set<number>();
    const now = this.clock();

    // Rule 1: age — older than maxAgeMs.
    if (policy.maxAgeMs !== undefined) {
      const cutoff = now - policy.maxAgeMs;
      for (const e of events) {
        if (e.committedAt <= cutoff) eligible.add(e.globalPosition);
      }
    }

    // Rule 2: count — everything before the newest maxCount.
    if (policy.maxCount !== undefined && events.length > policy.maxCount) {
      const keepFrom = events.length - policy.maxCount;
      for (let i = 0; i < keepFrom; i++) {
        eligible.add(events[i].globalPosition);
      }
    }

    // Rule 3: compaction — for each distinct key value, all but the LATEST
    // event are superseded. Latest = last occurrence in time order.
    if (policy.compactKeyField) {
      const lastPosByKey = new Map<string, number>();
      for (const e of events) {
        const k = String(getPath(e.data, policy.compactKeyField));
        lastPosByKey.set(k, e.globalPosition);
      }
      for (const e of events) {
        const k = String(getPath(e.data, policy.compactKeyField));
        if (e.globalPosition !== lastPosByKey.get(k)) {
          eligible.add(e.globalPosition);
        }
      }
    }

    const retained = events.filter((e) => !eligible.has(e.globalPosition));
    return {
      streamId,
      total: events.length,
      eligiblePositions: [...eligible].sort((a, b) => a - b),
      retained,
    };
  }

  /**
   * Applies a policy: returns the retained list (the "compacted stream").
   * The caller persists this — retention never rewrites the source log.
   */
  apply(
    events: readonly StoredEngineEvent[],
    policy: RetentionPolicy,
    streamId = ''
  ): { retained: StoredEngineEvent[]; removed: number } {
    const ev = this.evaluate(streamId, events, policy);
    return { retained: [...ev.retained], removed: ev.eligiblePositions.length };
  }
}

/** Local getPath (dot-path resolver — same semantics as repo engine's). */
function getPath(row: unknown, path: string): unknown {
  if (row === null || typeof row !== 'object') return undefined;
  let cur: unknown = row;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}
