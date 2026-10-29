/**
 * DeadLetterInspector — analysis over parked inbox records.
 *
 * Groups PARKED records by normalized error signature so operators can
 * spot systemic failures (one handler bug parking thousands) vs. bad
 * single messages. Error signatures normalize volatile content
 * (numbers, ids, quoted strings) so "user 42 not found" and "user 7
 * not found" cluster together.
 *
 * Also computes aging buckets and per-messageId failure histories to
 * drive decisions: redrive-all, redrive-by-signature, or purge.
 *
 * @module Inbox/Pattern
 */

import { createHash } from 'crypto';
import { InboxRecord, InboxState } from './types';

/** A cluster of parked records sharing an error signature. */
export interface ParkCluster {
  signature: string;
  count: number;
  /** Example record ids (up to 5). */
  samples: string[];
  /** Most recent park time in the cluster. */
  latestAt: number;
  messageIds: string[];
}

/** Normalize an error string into a stable signature. */
export function errorSignature(error: string | undefined): string {
  if (!error) return '<no-error>';
  const normalized = error
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b\d{13,}\b/g, '<ts>')          // epoch ms
    .replace(/\b\d+\b/g, '<n>')              // numbers
    .replace(/'[^']*'/g, "'<s>'")            // quoted strings
    .replace(/"[^"]*"/g, '"<s>"')
    .trim()
    .toLowerCase();
  return createHash('sha1').update(normalized).digest('hex').slice(0, 12) + ':' + normalized.slice(0, 80);
}

/** Age bucket name for a parked record. */
export function ageBucket(ageMs: number): string {
  const m = ageMs / 60_000;
  if (m < 5) return '<5m';
  if (m < 60) return '<1h';
  if (m < 60 * 24) return '<1d';
  return '>=1d';
}

export class DeadLetterInspector {
  /** Cluster parked records by error signature. */
  cluster(records: InboxRecord[]): ParkCluster[] {
    const clusters = new Map<string, ParkCluster>();
    for (const r of records) {
      if (r.state !== InboxState.PARKED) continue;
      const sig = errorSignature(r.parkedReason ?? r.lastError);
      let c = clusters.get(sig);
      if (!c) {
        c = { signature: sig, count: 0, samples: [], latestAt: 0, messageIds: [] };
        clusters.set(sig, c);
      }
      c.count++;
      c.messageIds.push(r.messageId);
      if (c.samples.length < 5) c.samples.push(r.id);
      const at = r.processedAt ?? r.receivedAt;
      if (at > c.latestAt) c.latestAt = at;
    }
    return [...clusters.values()].sort((a, b) => b.count - a.count);
  }

  /** Age histogram of parked records. */
  ageHistogram(records: InboxRecord[], now: number): Record<string, number> {
    const out: Record<string, number> = { '<5m': 0, '<1h': 0, '<1d': 0, '>=1d': 0 };
    for (const r of records) {
      if (r.state !== InboxState.PARKED) continue;
      const at = r.processedAt ?? r.receivedAt;
      out[ageBucket(now - at)]++;
    }
    return out;
  }

  /**
   * Suggest record ids worth a blanket redrive: those whose signature
   * cluster is large (systemic error likely fixed) — and optionally
   * filter to signatures that stopped occurring recently (bug window
   * closed).
   */
  redriveCandidates(records: InboxRecord[], minClusterSize = 2): string[] {
    const big = new Set(
      this.cluster(records)
        .filter((c) => c.count >= minClusterSize)
        .map((c) => c.signature)
    );
    return records
      .filter((r) => r.state === InboxState.PARKED && big.has(errorSignature(r.parkedReason ?? r.lastError)))
      .map((r) => r.id);
  }
}
