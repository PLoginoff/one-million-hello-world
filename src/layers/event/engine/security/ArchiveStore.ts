/**
 * ArchiveStore — cold-storage tier for aged events.
 *
 * Hot logs grow unboundedly; most events are never read after the projection
 * window closes. Real stores tier: recent events stay in fast storage, older
 * ones move to cheap cold storage (S3/Glacier in real systems — here, a
 * separate in-memory map standing in for "slower, larger, cheaper").
 *
 * Policy: events older than `retentionMs` (by `committedAt`) are eligible.
 * `archiveEligible` scans the hot `EventLog` tail→head, moves qualifying
 * events into the archive (serialized as JSON blobs), and returns how many
 * moved. The hot log keeps its positions stable — archived events are still
 * *addressable* by position, just not resident.
 *
 * Read-through: `resolve` checks the hot log first, falls back to the
 * archive. This is what lets a subscription keep replaying ancient history
 * transparently — the archive is a backing store, not a deletion.
 *
 * @module EventLayer/Engine/Security
 */

import { EventLog } from '../EventLog';
import { StoredEngineEvent } from '../types';
import { ArchiveRecord } from './types';

export interface ArchiveStoreOptions {
  /** Injectable clock for `archivedAt` stamps. */
  readonly clock?: () => number;
}

export class ArchiveStore {
  /** eventId → archive record (cold tier). */
  private readonly records = new Map<string, ArchiveRecord>();
  /** globalPosition → eventId (position-based lookup for replay). */
  private readonly byPosition = new Map<number, string>();
  private readonly clock: () => number;
  private totalArchived = 0;

  constructor(options: ArchiveStoreOptions = {}) {
    this.clock = options.clock ?? Date.now;
  }

  /**
   * Moves events older than `retentionMs` from `log` into cold storage.
   * Scans the global log oldest-first and stops at the first ineligible
   * event (log order = time order, so a tail-scan is O(aged) not O(n)).
   *
   * Returns the archived events' positions (callers can checkpoint).
   */
  archiveEligible(log: EventLog, retentionMs: number): number[] {
    const cutoff = this.clock() - retentionMs;
    const moved: number[] = [];
    for (const ev of log.readFrom(0)) {
      if (ev.committedAt > cutoff) break; // log is time-ordered
      if (this.records.has(ev.id)) continue;
      this.records.set(ev.id, {
        eventId: ev.id,
        streamId: ev.streamId,
        globalPosition: ev.globalPosition,
        blob: JSON.stringify(ev),
        archivedAt: this.clock(),
      });
      this.byPosition.set(ev.globalPosition, ev.id);
      moved.push(ev.globalPosition);
      this.totalArchived++;
    }
    return moved;
  }

  /** Read-through: hot log first, archive fallback. Null when truly absent. */
  resolve(log: EventLog, globalPosition: number): StoredEngineEvent | null {
    const hot = log.readFrom(globalPosition, 1);
    if (hot.length > 0 && hot[0].globalPosition === globalPosition) {
      return hot[0];
    }
    const id = this.byPosition.get(globalPosition);
    if (!id) return null;
    const rec = this.records.get(id);
    return rec ? (JSON.parse(rec.blob) as StoredEngineEvent) : null;
  }

  /** Fetches an archived event by id (point retrieval). */
  get(eventId: string): ArchiveRecord | null {
    return this.records.get(eventId) ?? null;
  }

  /** Rehydrates an archived event into a `StoredEngineEvent`. */
  retrieve(eventId: string): StoredEngineEvent | null {
    const rec = this.records.get(eventId);
    return rec ? (JSON.parse(rec.blob) as StoredEngineEvent) : null;
  }

  /** All archived positions for a stream (oldest-first). */
  positionsForStream(streamId: string): number[] {
    const out: number[] = [];
    for (const rec of this.records.values()) {
      if (rec.streamId === streamId) out.push(rec.globalPosition);
    }
    return out.sort((a, b) => a - b);
  }

  get size(): number {
    return this.records.size;
  }

  get totalEverArchived(): number {
    return this.totalArchived;
  }
}
