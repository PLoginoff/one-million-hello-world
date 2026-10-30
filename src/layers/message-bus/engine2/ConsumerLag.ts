/**
 * Consumer Lag Tracker
 *
 * Tracks committed consumer offsets against queue high-watermarks to
 * answer three operational questions: how far behind is this consumer
 * (lag), how fast is it catching up (drain rate), and when will it
 * finish (ETA).
 *
 * Drain rate is estimated by ordinary least-squares over the retained
 * sample window: slope of committed-offset vs. time. OLS handles
 * irregular sampling intervals better than "delta between first and
 * last" (robust to a single noisy sample) and costs O(W) per report
 * where W = window size — bounded and small.
 *
 * Memory: O(W) samples per (consumer, queue) pair; samples older than
 * `windowMs` are evicted lazily on write.
 *
 * @module MessageBusLayer/Engine2
 */

import {
  BusClock2,
  LagReport,
  LagSample,
  ManualBusClock2,
  SystemBusClock2,
} from './types';
import { BusTopology } from './BusTopology';

export interface LagTrackerOptions {
  readonly clock?: BusClock2;
  /** Retention window for samples (default 5 min). */
  readonly windowMs?: number;
}

interface ConsumerKey {
  readonly consumer: string;
  readonly queue: string;
}

/** \x00 cannot appear in a queue or consumer name, so the key is unambiguous. */
function keyOf(k: ConsumerKey): string {
  return `${k.consumer}\x00${k.queue}`;
}

export class ConsumerLagTracker {
  private readonly _topology: BusTopology;
  private readonly _clock: BusClock2;
  private readonly _windowMs: number;
  /** key → ascending-time samples. */
  private readonly _samples = new Map<string, { meta: ConsumerKey; samples: LagSample[] }>();
  /** Committed offsets — the tracker is also the offset store. */
  private readonly _offsets = new Map<string, number>();

  constructor(topology: BusTopology, options?: LagTrackerOptions) {
    this._topology = topology;
    this._clock = options?.clock ?? new SystemBusClock2();
    this._windowMs = options?.windowMs ?? 5 * 60 * 1000;
  }

  /** Record that `consumer` processed messages up to `offset` on `queue`. */
  commit(consumer: string, queue: string, offset: number): void {
    const k = keyOf({ consumer, queue });
    const prev = this._offsets.get(k);
    if (prev !== undefined && offset < prev) {
      // Offsets must be monotonic; rewinding would corrupt the rate fit.
      throw new Error(
        `offset regression for '${consumer}' on '${queue}': ${prev} → ${offset}`
      );
    }
    this._offsets.set(k, offset);
    this._recordSample({ consumer, queue });
  }

  /** Committed offset, or 0 when the consumer never committed. */
  committedOffset(consumer: string, queue: string): number {
    return this._offsets.get(keyOf({ consumer, queue })) ?? 0;
  }

  /** Current lag = high watermark − committed offset. */
  currentLag(consumer: string, queue: string): number {
    if (!this._topology.hasQueue(queue)) return 0;
    return Math.max(
      0,
      this._topology.queueSequence(queue) - this.committedOffset(consumer, queue)
    );
  }

  /** Snapshot a sample without a commit — used by periodic pollers. */
  sample(consumer: string, queue: string): LagSample {
    const committed = this.committedOffset(consumer, queue);
    const hw = this._topology.queueSequence(queue);
    const s: LagSample = {
      at: this._clock.now(),
      highWatermark: hw,
      committed,
      lag: Math.max(0, hw - committed),
    };
    this._append(consumer, queue, s);
    return s;
  }

  /** Full lag report with OLS drain-rate fit and ETA. */
  report(consumer: string, queue: string): LagReport {
    const k = keyOf({ consumer, queue });
    const rec = this._samples.get(k);
    const samples = rec ? rec.samples : [];
    this._evict(rec);

    const currentLag = this.currentLag(consumer, queue);
    let avgLag = 0;
    let maxLag = 0;
    for (const s of samples) {
      avgLag += s.lag;
      if (s.lag > maxLag) maxLag = s.lag;
    }
    if (samples.length > 0) avgLag /= samples.length;

    const rate = this._drainRate(samples);
    const eta =
      rate !== null && rate > 0 ? Math.ceil(currentLag / rate) : null;

    return {
      consumer,
      queue,
      currentLag,
      avgLag,
      maxLag,
      drainRatePerMs: rate,
      etaMs: eta,
    };
  }

  /**
   * All (consumer, queue) pairs currently tracked whose lag exceeds
   * `threshold` — the building block for lag alerts.
   */
  consumersAbove(threshold: number): LagReport[] {
    const out: LagReport[] = [];
    const seen = new Set<string>();
    for (const k of this._offsets.keys()) seen.add(k);
    for (const k of this._samples.keys()) seen.add(k);
    for (const k of seen) {
      const sep = k.indexOf('\x00');
      const consumer = k.slice(0, sep);
      const queue = k.slice(sep + 1);
      if (!this._topology.hasQueue(queue)) continue;
      const r = this.report(consumer, queue);
      if (r.currentLag > threshold) out.push(r);
    }
    return out;
  }

  // -- Internals --------------------------------------------------------

  private _recordSample(meta: ConsumerKey): void {
    const committed = this._offsets.get(keyOf(meta)) ?? 0;
    const hw = this._topology.queueSequence(meta.queue);
    this._append(meta.consumer, meta.queue, {
      at: this._clock.now(),
      highWatermark: hw,
      committed,
      lag: Math.max(0, hw - committed),
    });
  }

  private _append(consumer: string, queue: string, s: LagSample): void {
    const k = keyOf({ consumer, queue });
    let rec = this._samples.get(k);
    if (!rec) {
      rec = { meta: { consumer, queue }, samples: [] };
      this._samples.set(k, rec);
    }
    rec.samples.push(s);
    this._evict(rec);
  }

  private _evict(rec: { meta: ConsumerKey; samples: LagSample[] } | undefined): void {
    if (!rec) return;
    const cutoff = this._clock.now() - this._windowMs;
    // Samples are time-ordered; drop the expired prefix in one pass.
    let drop = 0;
    while (drop < rec.samples.length) {
      const s = rec.samples[drop];
      if (s === undefined || s.at >= cutoff) break;
      drop++;
    }
    if (drop > 0) rec.samples.splice(0, drop);
  }

  /**
   * OLS slope of committed vs. time over the window, in messages/ms.
   * Returns null for fewer than 2 usable points or degenerate time span.
   */
  private _drainRate(samples: readonly LagSample[]): number | null {
    const n = samples.length;
    if (n < 2) return null;
    let sx = 0;
    let sy = 0;
    for (const s of samples) {
      sx += s.at;
      sy += s.committed;
    }
    const mx = sx / n;
    const my = sy / n;
    let num = 0;
    let den = 0;
    for (const s of samples) {
      const dx = s.at - mx;
      num += dx * (s.committed - my);
      den += dx * dx;
    }
    if (den === 0) return null;
    return num / den;
  }
}
