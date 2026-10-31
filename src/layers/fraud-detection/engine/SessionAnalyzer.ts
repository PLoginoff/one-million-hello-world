/**
 * SessionAnalyzer — behavioral session fingerprinting.
 *
 * Bots pass fraud checks that humans fail only in Hollywood; the real
 * tell is in the *shape* of a session: machines click with metronomic
 * regularity, walk the same path every time, and never idle. This
 * analyzer condenses a raw action stream into fraud-useful features:
 *
 *   - gap statistics: mean/stddev of inter-action times — a scripted
 *     session's coefficient of variation (σ/μ) is far below human
 *     baseline; perfectly regular 200ms gaps are a dead giveaway;
 *   - path entropy: Shannon entropy over distinct navigation targets —
 *     humans wander (high entropy); scripts replay (near-zero);
 *   - action diversity: unique action kinds / total — macros repeat;
 *   - duration plausibility: a "browse→cart→checkout" session in 800ms
 *     isn't human at any regularity.
 *
 * The botScore composite weights these; each component is individually
 * exposed so rules can consume raw signals rather than one opaque sum.
 *
 * Sessions are bounded: `record` is O(1) per action (Welford variance,
 * histogram entropy updated incrementally), `features` O(distinct).
 *
 * @module FraudDetectionLayer/Engine
 */

import {
  SessionAction,
  SessionAnalyzerOptions,
  SessionFeatures,
} from './types';

interface SessionState {
  readonly sessionId: string;
  readonly userId?: string;
  firstAt: number;
  lastAt: number;
  /** Welford accumulators over inter-action gaps */
  gapCount: number;
  gapMean: number;
  gapM2: number;
  lastActionAt: number;
  actionCount: number;
  /** kind → count and target → count histograms */
  kinds: Map<string, number>;
  targets: Map<string, number>;
}

export class SessionAnalyzer {
  private readonly _cv: number;
  private readonly _minActions: number;
  private readonly _humanEntropy: number;
  private readonly _sessions = new Map<string, SessionState>();

  constructor(options: SessionAnalyzerOptions = {}) {
    this._cv = options.regularityCv ?? 0.15;
    this._minActions = Math.max(2, options.minActions ?? 4);
    this._humanEntropy = options.humanEntropyBits ?? 3.0;
  }

  /* ---------------------------------------------------------------- */
  /* Ingest                                                            */
  /* ---------------------------------------------------------------- */

  /** Fold one action into its session. O(1): incremental stats only. */
  record(sessionId: string, action: SessionAction, userId?: string): void {
    let s = this._sessions.get(sessionId);
    if (s === undefined) {
      s = {
        sessionId,
        userId,
        firstAt: action.at,
        lastAt: action.at,
        gapCount: 0,
        gapMean: 0,
        gapM2: 0,
        lastActionAt: -1,
        actionCount: 0,
        kinds: new Map(),
        targets: new Map(),
      };
      this._sessions.set(sessionId, s);
    }

    // Welford update on inter-action gap (only forward-moving gaps
    // count; out-of-order timestamps are clamped to 0, not negative).
    if (s.lastActionAt >= 0) {
      const gap = Math.max(0, action.at - s.lastActionAt);
      s.gapCount++;
      const delta = gap - s.gapMean;
      s.gapMean += delta / s.gapCount;
      s.gapM2 += delta * (gap - s.gapMean);
    }
    s.lastActionAt = Math.max(s.lastActionAt, action.at);
    s.lastAt = Math.max(s.lastAt, action.at);
    s.actionCount++;
    s.kinds.set(action.kind, (s.kinds.get(action.kind) ?? 0) + 1);
    if (action.target !== undefined) {
      s.targets.set(action.target, (s.targets.get(action.target) ?? 0) + 1);
    }
  }

  recordAll(
    sessionId: string,
    actions: readonly SessionAction[],
    userId?: string
  ): void {
    for (const a of actions) this.record(sessionId, a, userId);
  }

  /* ---------------------------------------------------------------- */
  /* Features                                                          */
  /* ---------------------------------------------------------------- */

  /** Feature extraction for a session; undefined if never recorded. */
  features(sessionId: string): SessionFeatures | undefined {
    const s = this._sessions.get(sessionId);
    if (s === undefined) return undefined;

    const gapVar = s.gapCount > 0 ? s.gapM2 / s.gapCount : 0;
    const gapStd = Math.sqrt(gapVar);
    const entropy = shannon(s.targets.size > 0 ? s.targets : s.kinds);
    const diversity = s.actionCount === 0 ? 0 : s.kinds.size / s.actionCount;
    const cv = s.gapMean > 0 ? gapStd / s.gapMean : 0;

    const f: SessionFeatures = {
      sessionId: s.sessionId,
      userId: s.userId,
      durationMs: s.lastAt - s.firstAt,
      actionCount: s.actionCount,
      meanGapMs: s.gapMean,
      gapStddevMs: gapStd,
      pathEntropyBits: entropy,
      actionDiversity: diversity,
      botScore: this._score(s, entropy, diversity, cv),
    };
    return f;
  }

  /**
   * Compare a live session against a user's historical session profile
   * (same-account anomaly detection): true when the live session's
   * entropy/diversity deviates from the user's median by >2×.
   */
  anomalousForUser(userId: string, sessionId: string): boolean {
    const live = this.features(sessionId);
    if (live === undefined) return false;
    const hist: SessionFeatures[] = [];
    for (const s of this._sessions.values()) {
      if (s.userId === userId && s.sessionId !== sessionId) {
        const f = this.features(s.sessionId);
        if (f !== undefined) hist.push(f);
      }
    }
    if (hist.length < 2) return false; // no baseline → no anomaly
    const medEntropy = median(hist.map((h) => h.pathEntropyBits));
    const medDiversity = median(hist.map((h) => h.actionDiversity));
    const entropyDrop =
      medEntropy > 0 ? medEntropy / Math.max(0.1, live.pathEntropyBits) : 1;
    const diversityDrop =
      medDiversity > 0 ? medDiversity / Math.max(0.1, live.actionDiversity) : 1;
    return entropyDrop > 2 || diversityDrop > 2;
  }

  /** Drop session state (post-decision cleanup). */
  close(sessionId: string): boolean {
    return this._sessions.delete(sessionId);
  }

  get sessionCount(): number {
    return this._sessions.size;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Composite bot likelihood: weighted mean of
   *   regularity (low CV), entropy deficit, low diversity, and
   *   impossibly-fast pace — each clamped to [0,1].
   */
  private _score(
    s: SessionState,
    entropy: number,
    diversity: number,
    cv: number
  ): number {
    if (s.actionCount < this._minActions) return 0;
    const regularity = cv < this._cv ? 1 - cv / this._cv : 0;
    const entropyDeficit = clamp01(1 - entropy / this._humanEntropy);
    const diversityDeficit = clamp01(1 - diversity);
    const speed = s.gapMean > 0 && s.gapMean < 300 ? 1 : 0;
    return clamp01(
      0.35 * regularity +
        0.30 * entropyDeficit +
        0.20 * diversityDeficit +
        0.15 * speed
    );
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Shannon entropy (bits) of a count histogram. */
function shannon(counts: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const c of counts.values()) total += c;
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
