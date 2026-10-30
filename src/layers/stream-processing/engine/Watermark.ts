/**
 * Watermark generation strategies — event-time progress tracking.
 *
 * A watermark is the engine's bet on completeness: "no record with
 * timestamp < watermark will arrive anymore". Everything downstream
 * (window firing, buffer pruning, late classification) keys off it.
 *
 * Two generators:
 *
 *   BoundedOutOfOrderness — the classic: wm = maxSeenTs - lateness.
 *   Assumes arrivals are at most `lateness` out of order. Cheap, and the
 *   only correct default when sources have no ordering metadata.
 *
 *   PerPartition — when the input is partitioned (Kafka-style), a slow or
 *   idle partition must NOT hold the global watermark back forever, and a
 *   fast partition must not push it ahead. Each partition tracks its own
 *   max timestamp; the emitted watermark is min over *active* partitions
 *   minus lateness. Partitions idle longer than `idleTimeoutMs` are
 *   excluded (Flink's withIdleness semantics) and re-join on their next
 *   record.
 *
 * Both are monotonic: the watermark never moves backwards.
 *
 * @module StreamProcessing/Engine
 */

export interface WatermarkGenerator {
  /** Feed a record's event-time; returns the current watermark after it. */
  observe(eventTimeMs: number): number;
  /** Current watermark (Number.NEGATIVE_INFINITY before any record). */
  current(): number;
}

/**
 * wm(t) = max( maxTs - latenessMs ) observed so far.
 */
export class BoundedOutOfOrderness implements WatermarkGenerator {
  private _maxTs = Number.NEGATIVE_INFINITY;
  private _wm = Number.NEGATIVE_INFINITY;
  private readonly _latenessMs: number;

  constructor(latenessMs: number) {
    if (latenessMs < 0) throw new Error('latenessMs must be >= 0');
    this._latenessMs = latenessMs;
  }

  observe(eventTimeMs: number): number {
    if (eventTimeMs > this._maxTs) this._maxTs = eventTimeMs;
    const candidate = this._maxTs - this._latenessMs;
    if (candidate > this._wm) this._wm = candidate;
    return this._wm;
  }

  current(): number {
    return this._wm;
  }
}

interface PartitionState {
  maxTs: number;
  lastSeenAt: number;
}

/**
 * Per-partition watermark with idleness detection.
 *
 * `nowMs` is event-time of the newest observed record per partition
 * (or wall clock via the caller) — used only to detect idle partitions.
 */
export class PerPartitionWatermark implements WatermarkGenerator {
  private readonly _latenessMs: number;
  private readonly _idleTimeoutMs: number;
  private readonly _parts = new Map<string, PartitionState>();
  private _wm = Number.NEGATIVE_INFINITY;

  constructor(opts: { latenessMs: number; idleTimeoutMs: number }) {
    this._latenessMs = Math.max(0, opts.latenessMs);
    this._idleTimeoutMs = opts.idleTimeoutMs;
  }

  /**
   * @param partition source partition id
   * @param eventTimeMs record's event time
   * @param nowMs "current" time for idleness (usually the record's own
   *        arrival time in processing-time, or max observed event time)
   */
  observePartition(partition: string, eventTimeMs: number, nowMs: number): number {
    let p = this._parts.get(partition);
    if (!p) {
      p = { maxTs: Number.NEGATIVE_INFINITY, lastSeenAt: nowMs };
      this._parts.set(partition, p);
    }
    if (eventTimeMs > p.maxTs) p.maxTs = eventTimeMs;
    p.lastSeenAt = nowMs;
    return this._recompute(nowMs);
  }

  /**
   * Re-evaluate the watermark against `nowMs` — call periodically so an
   * idle partition gets excluded even when no records arrive.
   */
  tick(nowMs: number): number {
    return this._recompute(nowMs);
  }

  private _recompute(nowMs: number): number {
    let min = Number.POSITIVE_INFINITY;
    let anyActive = false;
    for (const p of this._parts.values()) {
      if (nowMs - p.lastSeenAt > this._idleTimeoutMs) continue; // idle
      anyActive = true;
      if (p.maxTs < min) min = p.maxTs;
    }
    if (!anyActive) return this._wm; // keep last known watermark
    const candidate = min - this._latenessMs;
    if (candidate > this._wm) this._wm = candidate;
    return this._wm;
  }

  observe(eventTimeMs: number): number {
    // Single-partition convenience — uses event time as "now".
    return this.observePartition('__default__', eventTimeMs, eventTimeMs);
  }

  current(): number {
    return this._wm;
  }

  /** Partitions currently counted in the min (diagnostics). */
  activePartitions(nowMs: number): string[] {
    const out: string[] = [];
    for (const [id, p] of this._parts) {
      if (nowMs - p.lastSeenAt <= this._idleTimeoutMs) out.push(id);
    }
    return out;
  }
}
