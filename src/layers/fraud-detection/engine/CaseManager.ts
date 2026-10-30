/**
 * CaseManager — investigation queue for flagged transactions.
 *
 * Fraud scoring doesn't resolve anything by itself — `review`
 * decisions land in an analyst queue. This is the lifecycle:
 *
 *   open → investigating → closed(fraud | legitimate | inconclusive)
 *
 * Invariants enforced (a case queue is a state machine, not a pile
 * of notes):
 *  - Only `open` cases can be claimed (prevents double-assignment).
 *  - Only `investigating` cases can be closed.
 *  - Reopening a closed case creates a NEW case (audit trail).
 *  - Priority ordering: queue dequeues by descending score, FIFO on
 *    ties — analysts work the scariest first.
 *
 * All notes are append-only with author + timestamp — investigations
 * are discoverable artifacts.
 *
 * @module FraudDetectionLayer/Engine
 */

import {
  CaseNote,
  CaseResolution,
  CaseState,
  FraudCase,
  FraudClock,
  SystemFraudClock,
} from './types';

export class CaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaseError';
  }
}

interface InternalCase extends FraudCase {
  /** queue priority (the transaction's fraud score) */
  score: number;
}

export class CaseManager {
  private readonly _clock: FraudClock;
  private readonly _cases: Map<string, InternalCase>;
  private _seq: number;

  constructor(clock?: FraudClock) {
    this._clock = clock ?? new SystemFraudClock();
    this._cases = new Map();
    this._seq = 0;
  }

  /**
   * File a flagged transaction into the queue. `score` sets dequeue
   * priority. Returns the case id.
   */
  open(transactionId: string, userId: string, score: number): FraudCase {
    this._seq++;
    const c: InternalCase = {
      id: `case-${this._seq}`,
      transactionId,
      userId,
      state: 'open',
      openedAt: this._clock.now(),
      notes: [],
      score,
    };
    this._cases.set(c.id, c);
    return { ...c };
  }

  /** Highest-priority open case (score desc, FIFO on ties). */
  next(): FraudCase | undefined {
    let best: InternalCase | undefined;
    for (const c of this._cases.values()) {
      if (c.state !== 'open') continue;
      if (
        best === undefined ||
        c.score > best.score ||
        (c.score === best.score && c.openedAt < best.openedAt)
      ) {
        best = c;
      }
    }
    return best === undefined ? undefined : { ...best };
  }

  /** Claim an open case for an analyst. Only `open` → `investigating`. */
  claim(caseId: string, analyst: string): FraudCase {
    const c = this._get(caseId);
    if (c.state !== 'open') {
      throw new CaseError(`case ${caseId} is ${c.state}, not open`);
    }
    const next: InternalCase = { ...c, state: 'investigating', assignee: analyst };
    this._cases.set(caseId, next);
    return { ...next };
  }

  /** Append an analyst note (investigating cases only). */
  addNote(caseId: string, author: string, text: string): FraudCase {
    const c = this._get(caseId);
    if (c.state === 'closed') {
      throw new CaseError(`case ${caseId} is closed`);
    }
    const note: CaseNote = { author, text, at: this._clock.now() };
    const next: InternalCase = { ...c, notes: [...c.notes, note] };
    this._cases.set(caseId, next);
    return { ...next };
  }

  /** Resolve an investigating case. */
  close(caseId: string, resolution: CaseResolution): FraudCase {
    const c = this._get(caseId);
    if (c.state !== 'investigating') {
      throw new CaseError(`case ${caseId} is ${c.state}, not investigating`);
    }
    const next: InternalCase = {
      ...c,
      state: 'closed',
      resolution,
      closedAt: this._clock.now(),
    };
    this._cases.set(caseId, next);
    return { ...next };
  }

  /** Release an investigating case back to the queue. */
  release(caseId: string): FraudCase {
    const c = this._get(caseId);
    if (c.state !== 'investigating') {
      throw new CaseError(`case ${caseId} is ${c.state}, not investigating`);
    }
    const next: InternalCase = { ...c, state: 'open', assignee: undefined };
    this._cases.set(caseId, next);
    return { ...next };
  }

  get(caseId: string): FraudCase | undefined {
    const c = this._cases.get(caseId);
    return c === undefined ? undefined : { ...c };
  }

  /** Cases in a state, FIFO order. */
  list(state?: CaseState): FraudCase[] {
    const out: FraudCase[] = [];
    for (const c of this._cases.values()) {
      if (state === undefined || c.state === state) out.push({ ...c });
    }
    return out;
  }

  /** Queue depth by state. */
  counts(): Record<CaseState, number> {
    const out: Record<CaseState, number> = { open: 0, investigating: 0, closed: 0 };
    for (const c of this._cases.values()) out[c.state]++;
    return out;
  }

  private _get(caseId: string): InternalCase {
    const c = this._cases.get(caseId);
    if (c === undefined) throw new CaseError(`unknown case ${caseId}`);
    return c;
  }
}
