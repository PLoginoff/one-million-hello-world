/**
 * TrendingTracker — exponentially-decayed "what's hot now".
 *
 * A plain event-count leaderboard answers "most popular ever" — it
 * can't surface a product going viral *right now*. Trending weights
 * each event by recency:
 *
 *   score(item, t) = Σ_events w_kind · 2^(−(t − event.t)/halfLife)
 *
 * The naive implementation keeps every event per item; this one keeps
 * a bounded per-item ring buffer (`maxEventsPerItem`) and compacts
 * overflow into a single checkpoint (decayed sum + anchor time), so
 * memory is O(items × cap) regardless of volume. Compaction preserves
 * the score exactly — checkpoint = Σ aged contributions re-based at
 * the newest timestamp.
 *
 * Half-life defaults to 6 h: a product must roughly double its hourly
 * rate to overtake an item at the same volume from yesterday.
 *
 * Complexity: record O(1) amortized; leaderboard O(items·log items);
 * memory O(items·cap).
 *
 * @module RecommendationLayer/Engine
 */

import { ItemId } from '../implementations/recommend/Types';
import {
  InteractionEvent,
  InteractionKind,
  RecClock,
  SystemRecClock,
  TrendingItem,
  TrendingOptions,
} from './types';

const DEFAULT_WEIGHTS: Readonly<Record<InteractionKind, number>> = {
  view: 1,
  click: 2,
  'add-to-cart': 4,
  purchase: 8,
  like: 3,
  skip: 0, // skipping shouldn't feed virality
  rating: 2,
};

interface TimedWeight {
  readonly t: number;
  readonly w: number;
}

interface ItemSeries {
  /** ring buffer of recent events (oldest-first logical order) */
  events: TimedWeight[];
  head: number; // ring read cursor
  count: number;
  /** compacted score checkpoint re-based at `checkpointT` */
  checkpoint: number;
  checkpointT: number;
}

export class TrendingTracker {
  private readonly _halfLife: number;
  private readonly _weights: Readonly<Record<InteractionKind, number>>;
  private readonly _cap: number;
  private readonly _clock: RecClock;
  private readonly _items = new Map<ItemId, ItemSeries>();

  constructor(options: TrendingOptions = {}, clock?: RecClock) {
    this._halfLife = options.halfLifeMs ?? 6 * 3_600_000;
    this._weights = { ...DEFAULT_WEIGHTS, ...(options.kindWeights ?? {}) };
    this._cap = Math.max(8, options.maxEventsPerItem ?? 512);
    this._clock = clock ?? new SystemRecClock();
  }

  /* ---------------------------------------------------------------- */
  /* Ingest                                                            */
  /* ---------------------------------------------------------------- */

  record(event: InteractionEvent): void {
    const w = this._weight(event);
    if (w <= 0) return;
    let s = this._items.get(event.itemId);
    if (s === undefined) {
      s = {
        events: [],
        head: 0,
        count: 0,
        checkpoint: 0,
        checkpointT: event.timestamp,
      };
      this._items.set(event.itemId, s);
    }
    if (s.count < this._cap) {
      // ring not full — append
      s.events.push({ t: event.timestamp, w });
      s.count++;
    } else {
      // full: fold the oldest slot into the checkpoint, reuse the slot
      const oldest = s.events[s.head];
      const base = Math.max(s.checkpointT, oldest.t);
      s.checkpoint = s.checkpoint * this._decayFactor(s.checkpointT, base) +
        oldest.w * this._decayFactor(oldest.t, base);
      s.checkpointT = base;
      s.events[s.head] = { t: event.timestamp, w };
      s.head = (s.head + 1) % this._cap;
    }
  }

  recordAll(events: readonly InteractionEvent[]): void {
    for (const e of events) this.record(e);
  }

  /* ---------------------------------------------------------------- */
  /* Queries                                                           */
  /* ---------------------------------------------------------------- */

  /** Decayed score for one item at `now` (default: clock). */
  score(itemId: ItemId, now?: number): number {
    const s = this._items.get(itemId);
    if (s === undefined) return 0;
    const t = now ?? this._clock.now();
    return this._scoreAt(s, t);
  }

  /** Top-N items by decayed score right now. */
  top(n = 10, now?: number): TrendingItem[] {
    const t = now ?? this._clock.now();
    const out: TrendingItem[] = [];
    for (const [itemId, s] of this._items) {
      out.push({ itemId, score: this._scoreAt(s, t), events: s.count });
    }
    out.sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
    return out.slice(0, n);
  }

  /**
   * Leaderboard restricted to a candidate set — the normal call site:
   * rank candidates by trend without scanning the whole catalog.
   */
  topAmong(candidates: readonly ItemId[], n = 10, now?: number): TrendingItem[] {
    const t = now ?? this._clock.now();
    const out: TrendingItem[] = [];
    for (const itemId of candidates) {
      const s = this._items.get(itemId);
      if (s !== undefined) {
        out.push({ itemId, score: this._scoreAt(s, t), events: s.count });
      }
    }
    out.sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
    return out.slice(0, n);
  }

  get trackedItems(): number {
    return this._items.size;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _weight(e: InteractionEvent): number {
    return e.kind === 'rating' ? e.rating ?? 0 : this._weights[e.kind];
  }

  /** multiplier applied to a value recorded at `from` observed at `to`. */
  private _decayFactor(from: number, to: number): number {
    if (this._halfLife <= 0 || to <= from) return 1;
    return Math.pow(0.5, (to - from) / this._halfLife);
  }

  private _scoreAt(s: ItemSeries, now: number): number {
    let sum = s.checkpoint * this._decayFactor(s.checkpointT, now);
    for (let i = 0; i < s.count; i++) {
      const e = s.events[(s.head + i) % s.events.length];
      if (e !== undefined) sum += e.w * this._decayFactor(e.t, now);
    }
    return sum;
  }
}
