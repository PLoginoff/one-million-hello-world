/**
 * InteractionStream — real-time per-event model updates.
 *
 * Batch recommenders retrain nightly; production systems can't wait —
 * a user's intent shifts *within* a session (browsing TVs → comparing
 * HDMI cables in three clicks). This engine is the ingestion point
 * that folds every interaction event into the online models in O(1):
 *
 *   event ──► kind weight map ──► OnlineLearner.record (SGD step)
 *          ──► session tracker ──► session close ──► Markov.learn(seq)
 *          ──► TrendingTracker.record
 *
 * Sessionization is the subtle part: sequences are learned only when
 * a session *closes* (gap > sessionGapMs or explicit flush), because a
 * half-open session teaches transitions that may never complete. The
 * per-user state is two ints + a ring of item ids — cheap enough to
 * keep for millions of users.
 *
 * `sinks` are pluggable: anything implementing `onEvent`/`onSession`
 * receives the stream — the bundled models cover the common case, but
 * the seam lets callers attach feature stores or loggers without
 * subclassing.
 *
 * @module RecommendationLayer/Engine
 */

import { ItemId, UserId } from '../implementations/recommend/Types';
import {
  InteractionEvent,
  InteractionKind,
  RecClock,
  StreamOptions,
  StreamUpdateResult,
  SystemRecClock,
} from './types';
import { MarkovSequenceModel } from './MarkovSequenceModel';
import { OnlineLearner } from './OnlineLearner';
import { TrendingTracker } from './TrendingTracker';

/** Default implicit-feedback weights by event kind. */
export const DEFAULT_KIND_WEIGHTS: Readonly<Record<InteractionKind, number>> = {
  view: 1,
  click: 2,
  'add-to-cart': 4,
  purchase: 8,
  like: 3,
  skip: -0.5,
  rating: 0, // rating events use their `rating` field directly
};

/** Optional extra consumer of the raw stream. */
export interface InteractionSink {
  onEvent?(event: InteractionEvent, weight: number): void;
  /** fired when a session closes; items in order. */
  onSession?(userId: UserId, items: readonly ItemId[]): void;
}

interface UserStreamState {
  /** ms timestamp of the user's last event */
  lastT: number;
  /** current session id (increments per gap) */
  sessionId: number;
  /** items in the open session, in order */
  openItems: ItemId[];
}

export interface InteractionStreamDeps {
  readonly learner?: OnlineLearner;
  readonly sequence?: MarkovSequenceModel;
  readonly trending?: TrendingTracker;
  readonly sinks?: readonly InteractionSink[];
}

export class InteractionStream {
  private readonly _weights: Readonly<Record<InteractionKind, number>>;
  private readonly _gapMs: number;
  private readonly _clock: RecClock;
  private readonly _learner: OnlineLearner;
  private readonly _sequence: MarkovSequenceModel;
  private readonly _trending: TrendingTracker;
  private readonly _sinks: readonly InteractionSink[];
  private readonly _users = new Map<UserId, UserStreamState>();
  private _processed = 0;
  private _sessionsClosed = 0;

  constructor(
    options: StreamOptions = {},
    deps: InteractionStreamDeps = {},
    clock?: RecClock
  ) {
    this._clock = clock ?? new SystemRecClock();
    this._weights = { ...DEFAULT_KIND_WEIGHTS, ...(options.kindWeights ?? {}) };
    this._gapMs = options.sessionGapMs ?? 30 * 60_000;
    this._learner = deps.learner ?? new OnlineLearner({}, this._clock);
    this._sequence = deps.sequence ?? new MarkovSequenceModel({}, this._clock);
    this._trending = deps.trending ?? new TrendingTracker({}, this._clock);
    this._sinks = deps.sinks ?? [];
  }

  get learner(): OnlineLearner {
    return this._learner;
  }
  get sequence(): MarkovSequenceModel {
    return this._sequence;
  }
  get trending(): TrendingTracker {
    return this._trending;
  }
  get processed(): number {
    return this._processed;
  }
  get sessionsClosed(): number {
    return this._sessionsClosed;
  }

  /* ---------------------------------------------------------------- */
  /* Ingest                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Fold one event into every downstream model. Session boundary
   * detection runs on event timestamps (not wall clock) so out-of-order
   * delivery still produces sane sessions — a late event with an old
   * timestamp simply extends the session it belongs to.
   */
  record(event: InteractionEvent): StreamUpdateResult {
    const weight =
      event.kind === 'rating'
        ? event.rating ?? 0
        : this._weights[event.kind];

    const st = this._stateFor(event.userId, event.timestamp);
    let newSession = false;
    if (st.lastT >= 0 && event.timestamp - st.lastT > this._gapMs) {
      this._closeSession(event.userId, st);
      newSession = true;
    } else if (st.lastT < 0) {
      newSession = true;
    }
    st.lastT = Math.max(st.lastT, event.timestamp);
    st.openItems.push(event.itemId);

    // online MF learns negative weights too (skip pushes factors apart)
    this._learner.record({
      userId: event.userId,
      itemId: event.itemId,
      weight,
    });
    this._trending.record(event);

    for (const s of this._sinks) s.onEvent?.(event, weight);
    this._processed++;

    return {
      userId: event.userId,
      itemId: event.itemId,
      weight,
      sessionId: st.sessionId,
      newSession,
    };
  }

  recordAll(events: readonly InteractionEvent[]): void {
    for (const e of events) this.record(e);
  }

  /**
   * Close every open session — call at shutdown or on a periodic timer
   * so the tail of each user's stream still teaches the sequence model.
   */
  flush(): number {
    let closed = 0;
    for (const [userId, st] of this._users) {
      if (st.openItems.length > 0) {
        this._closeSession(userId, st);
        closed++;
      }
    }
    return closed;
  }

  /** Open-session items for a user (what "continue watching" reads). */
  openSession(userId: UserId): readonly ItemId[] {
    return this._users.get(userId)?.openItems ?? [];
  }

  /** Users with any recorded event. */
  get activeUsers(): number {
    return this._users.size;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _stateFor(userId: UserId, _t: number): UserStreamState {
    let st = this._users.get(userId);
    if (st === undefined) {
      st = { lastT: -1, sessionId: 0, openItems: [] };
      this._users.set(userId, st);
    }
    return st;
  }

  private _closeSession(userId: UserId, st: UserStreamState): void {
    if (st.openItems.length === 0) return;
    const items = st.openItems;
    st.openItems = [];
    st.sessionId++;
    this._sessionsClosed++;
    // dedupe consecutive repeats — "rewatch the trailer twice" isn't a
    // transition signal worth teaching.
    const deduped: ItemId[] = [];
    for (const it of items) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== it) {
        deduped.push(it);
      }
    }
    if (deduped.length > 0) this._sequence.learn(deduped, st.lastT);
    for (const s of this._sinks) s.onSession?.(userId, deduped);
  }
}
