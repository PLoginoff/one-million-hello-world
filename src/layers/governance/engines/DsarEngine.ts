/**
 * Data Subject Request (DSAR) Tracking Engine
 *
 * Tracks GDPR/CCPA-style data subject requests through a state machine:
 *
 *   submitted → identity-verification → in-progress → awaiting-response → completed
 *       │              │                      │
 *       └──────────────┴──────→ rejected ←────┘
 *
 * Transition rules:
 * - `completed` and `rejected` are terminal.
 * - `rejected` is reachable from any non-terminal state.
 * - `submitted` may also go straight to `in-progress` when identity is
 *   verified out-of-band.
 *
 * Every request carries a statutory `dueAt` deadline; the engine reports
 * requests at risk of breach. All transitions are appended to an audit
 * history (who, when, from→to).
 *
 * @module GovernanceLayer/Engines
 */

import {
  DsarKind,
  DsarRequest,
  DsarState,
  IClock,
  SystemClock,
} from './types';

/** Allowed transitions; terminal states have no outgoing edges. */
const TRANSITIONS: Readonly<Record<DsarState, ReadonlyArray<DsarState>>> = {
  [DsarState.Submitted]: [DsarState.IdentityVerification, DsarState.InProgress, DsarState.Rejected],
  [DsarState.IdentityVerification]: [DsarState.InProgress, DsarState.Rejected],
  [DsarState.InProgress]: [DsarState.AwaitingResponse, DsarState.Completed, DsarState.Rejected],
  [DsarState.AwaitingResponse]: [DsarState.Completed, DsarState.Rejected],
  [DsarState.Completed]: [],
  [DsarState.Rejected]: [],
};

const TERMINAL: ReadonlySet<DsarState> = new Set([DsarState.Completed, DsarState.Rejected]);

let dsarSeq = 0;

export class DsarEngine {
  private readonly _requests: Map<string, DsarRequest>;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._requests = new Map();
    this._clock = clock;
  }

  /** File a new DSAR. `dueInDays` is typically 30 (GDPR) or 45 (CCPA). */
  submit(subjectId: string, kind: DsarKind, dueInDays: number): DsarRequest {
    dsarSeq += 1;
    const now = this._clock.now();
    const req: DsarRequest = {
      id: `dsar-${dsarSeq.toString(36)}`,
      subjectId,
      kind,
      state: DsarState.Submitted,
      submittedAt: now,
      dueAt: now + dueInDays * 24 * 60 * 60 * 1000,
      completedAt: null,
      history: [],
    };
    this._requests.set(req.id, req);
    return req;
  }

  /**
   * Attempt a state transition. Returns true on success, false when the
   * transition is not in the allowed graph. Illegal transitions are
   * rejected (not silently ignored) and are NOT written to history.
   */
  transition(requestId: string, to: DsarState, actorId: string, note: string | null = null): boolean {
    const req = this._requests.get(requestId);
    if (!req) throw new Error(`Unknown DSAR: ${requestId}`);

    const allowed = TRANSITIONS[req.state];
    if (!allowed.includes(to)) return false;

    req.history.push({ from: req.state, to, at: this._clock.now(), actorId, note });
    req.state = to;
    if (TERMINAL.has(to)) {
      req.completedAt = this._clock.now();
    }
    return true;
  }

  get(requestId: string): DsarRequest | null {
    return this._requests.get(requestId) ?? null;
  }

  /** All requests for a data subject, newest first. */
  forSubject(subjectId: string): DsarRequest[] {
    return [...this._requests.values()]
      .filter((r) => r.subjectId === subjectId)
      .sort((a, b) => b.submittedAt - a.submittedAt);
  }

  /** Non-terminal requests past their statutory deadline. */
  overdue(): DsarRequest[] {
    const now = this._clock.now();
    return [...this._requests.values()].filter((r) => !TERMINAL.has(r.state) && r.dueAt <= now);
  }

  /**
   * Requests due within `withinMs` (and not yet overdue) — the "at risk"
   * queue a compliance team works from.
   */
  dueSoon(withinMs: number): DsarRequest[] {
    const now = this._clock.now();
    return [...this._requests.values()].filter(
      (r) => !TERMINAL.has(r.state) && r.dueAt > now && r.dueAt <= now + withinMs
    );
  }

  /** Verify a transition path is legal without executing it. */
  canTransition(requestId: string, to: DsarState): boolean {
    const req = this._requests.get(requestId);
    if (!req) throw new Error(`Unknown DSAR: ${requestId}`);
    return TRANSITIONS[req.state].includes(to);
  }

  /** Full audit history for a request (immutable copy). */
  history(requestId: string): ReadonlyArray<DsarRequest['history'][number]> {
    const req = this._requests.get(requestId);
    if (!req) throw new Error(`Unknown DSAR: ${requestId}`);
    return req.history.map((h) => ({ ...h }));
  }
}
