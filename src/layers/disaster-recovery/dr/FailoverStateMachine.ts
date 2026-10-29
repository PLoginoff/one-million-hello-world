/**
 * Disaster Recovery — Failover State Machine
 *
 * Explicit guarded state machine driving primary→standby promotion:
 *
 *   HEALTHY → DEGRADED → FAILOVER_INITIATED → QUORUM_CHECK → PROMOTING
 *     → REPOINTING → VERIFYING → FAILED_OVER → RECOVERING → HEALTHY
 *
 * Any pre-FAILED_OVER guard failure transitions to ABORTED, which can only
 * reset to HEALTHY — a half-promoted topology can never silently "continue".
 *
 * Quorum model
 * ------------
 * The candidate standby must collect votes from a strict majority of the
 * configured voter set (classic N/2+1, tolerating ⌊(N-1)/2⌋ failures). The
 * incumbent primary's vote is NOT required — the whole point is promoting
 * past a dead primary — but votes from unreachable nodes are not counted,
 * which prevents split-brain under partition: the minority side can never
 * reach majority.
 *
 * Promotion guards (evaluated at QUORUM_CHECK):
 *   1. quorum reached (majority of voters healthy & voting yes),
 *   2. candidate position within `maxPositionLag` of the last known primary
 *      position — refuses to promote a hopelessly stale standby,
 *   3. no concurrent failover already FAILED_OVER for this service.
 *
 * Hooks (`repointTraffic`, `verifyWrites`) are injected so tests can simulate
 * DNS/connection-string repointing and post-failover write probes.
 *
 * @module DisasterRecovery/DR
 */

import {
  DrClock,
  DrNode,
  FailoverState,
  FailoverTransition,
  FAILOVER_TRANSITIONS,
} from './DrTypes';

export class InvalidFailoverTransition extends Error {
  constructor(from: FailoverState, to: FailoverState) {
    super(`invalid failover transition ${from} → ${to}`);
    this.name = 'InvalidFailoverTransition';
  }
}

export class QuorumNotReached extends Error {
  readonly votesFor: number;
  readonly votesNeeded: number;
  constructor(votesFor: number, votesNeeded: number) {
    super(`quorum not reached: ${votesFor}/${votesNeeded} votes`);
    this.name = 'QuorumNotReached';
    this.votesFor = votesFor;
    this.votesNeeded = votesNeeded;
  }
}

export interface FailoverHooks {
  /** Repoint client traffic at the new primary. Must throw on failure. */
  repointTraffic: (newPrimaryId: string) => Promise<void> | void;
  /** Probe post-failover writes/reads. Return false to abort. */
  verifyWrites: (newPrimaryId: string) => Promise<boolean> | boolean;
  /** Optional: fence the old primary (STONITH) before promotion. */
  fenceOldPrimary?: (oldPrimaryId: string) => Promise<void> | void;
}

export interface FailoverResult {
  readonly finalState: FailoverState;
  readonly newPrimaryId?: string;
  readonly transitions: ReadonlyArray<FailoverTransition>;
  readonly abortReason?: string;
  readonly votesFor: number;
  readonly votesNeeded: number;
}

export class FailoverStateMachine {
  private readonly _clock: DrClock;
  private readonly _hooks: FailoverHooks;
  /** Maximum position gap between candidate and last-known-primary to promote. */
  private readonly _maxPositionLag: bigint;

  private _state: FailoverState = FailoverState.HEALTHY;
  private _transitions: FailoverTransition[] = [];
  private _primaryId: string;
  private _abortReason: string | undefined;
  private _votesFor = 0;
  private _votesNeeded = 0;

  constructor(
    primaryId: string,
    hooks: FailoverHooks,
    clock: DrClock = Date.now,
    maxPositionLag: bigint = 0n
  ) {
    this._primaryId = primaryId;
    this._hooks = hooks;
    this._clock = clock;
    this._maxPositionLag = maxPositionLag;
  }

  get state(): FailoverState {
    return this._state;
  }

  get primaryId(): string {
    return this._primaryId;
  }

  get transitions(): ReadonlyArray<FailoverTransition> {
    return this._transitions;
  }

  get abortReason(): string | undefined {
    return this._abortReason;
  }

  /** Guarded transition — throws on illegal edges. */
  transition(to: FailoverState, reason = ''): void {
    const allowed = FAILOVER_TRANSITIONS[this._state];
    if (!allowed.includes(to)) {
      throw new InvalidFailoverTransition(this._state, to);
    }
    this._transitions.push({ from: this._state, to, at: this._clock(), reason });
    this._state = to;
  }

  /** Mark the topology degraded (primary suspected unhealthy). */
  degrade(reason: string): void {
    this.transition(FailoverState.DEGRADED, reason);
  }

  /**
   * Execute a full failover of `voters` onto `candidate`.
   *
   * `voters` is the full configured voter set INCLUDING the failed primary's
   * (unreachable) slot and the candidate. A strict majority of slots must be
   * healthy-and-voting for quorum. `candidate` must be a member of `voters`.
   */
  async failover(candidate: DrNode, voters: ReadonlyArray<DrNode>): Promise<FailoverResult> {
    this._votesFor = 0;
    this._votesNeeded = Math.floor(voters.length / 2) + 1;

    const abort = (reason: string): FailoverResult => {
      this._abortReason = reason;
      // Transition to ABORTED is legal from every non-terminal pre-verify state
      // via the declared edges; ABORTED itself is not legal to re-enter, so
      // guard against double-abort.
      if (this._state !== FailoverState.ABORTED && this._state !== FailoverState.FAILED_OVER) {
        this.transition(FailoverState.ABORTED, reason);
      }
      return this._result(undefined);
    };

    // FAILOVER_INITIATED
    if (this._state !== FailoverState.FAILOVER_INITIATED) {
      this.transition(FailoverState.FAILOVER_INITIATED, `promote ${candidate.nodeId}`);
    }

    // QUORUM_CHECK
    this.transition(FailoverState.QUORUM_CHECK, 'collecting votes');
    const quorum = this._collectVotes(candidate, voters);
    if (!quorum.reached) {
      return abort(`quorum failed: ${quorum.votes}/${this._votesNeeded} (${quorum.reason})`);
    }

    // Staleness guard: candidate position within maxPositionLag of best known.
    const bestKnown = voters.reduce((m, v) => (v.position > m ? v.position : m), 0n);
    if (bestKnown - candidate.position > this._maxPositionLag) {
      return abort(
        `candidate stale: lag ${bestKnown - candidate.position} > max ${this._maxPositionLag}`
      );
    }

    // PROMOTING — fence old primary then promote.
    this.transition(FailoverState.PROMOTING, `quorum ${quorum.votes}/${this._votesNeeded}`);
    try {
      if (this._hooks.fenceOldPrimary) {
        await this._hooks.fenceOldPrimary(this._primaryId);
      }
    } catch (e) {
      return abort(`fencing failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // REPOINTING
    this.transition(FailoverState.REPOINTING, 'repointing traffic');
    try {
      await this._hooks.repointTraffic(candidate.nodeId);
    } catch (e) {
      return abort(`repoint failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // VERIFYING
    this.transition(FailoverState.VERIFYING, 'verifying writes');
    let ok = false;
    try {
      ok = await this._hooks.verifyWrites(candidate.nodeId);
    } catch (e) {
      return abort(`verify threw: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!ok) {
      return abort('post-failover write verification failed');
    }

    this.transition(FailoverState.FAILED_OVER, `new primary ${candidate.nodeId}`);
    this._primaryId = candidate.nodeId;
    return this._result(candidate.nodeId);
  }

  /** Begin failback/recovery after a completed failover. */
  beginRecovery(reason = 'failback'): void {
    this.transition(FailoverState.RECOVERING, reason);
  }

  /** Recovery complete — topology healthy again. */
  completeRecovery(reason = 'recovered'): void {
    this.transition(FailoverState.HEALTHY, reason);
  }

  /** Reset an aborted machine back to HEALTHY (operator action). */
  reset(reason = 'operator reset'): void {
    this.transition(FailoverState.HEALTHY, reason);
    this._abortReason = undefined;
  }

  /** Majority-of-slots quorum count. */
  votesNeeded(voterCount: number): number {
    return Math.floor(voterCount / 2) + 1;
  }

  // ------------------------------------------------------------------ private

  /**
   * Count votes. A voter contributes iff healthy. The candidate always votes
   * for itself. The (presumed-dead) primary slot contributes only if its node
   * record is still healthy — under a real partition it won't be.
   */
  private _collectVotes(
    candidate: DrNode,
    voters: ReadonlyArray<DrNode>
  ): { reached: boolean; votes: number; reason: string } {
    let votes = 0;
    let selfFound = false;
    for (const v of voters) {
      if (v.nodeId === candidate.nodeId) selfFound = true;
      if (v.healthy) votes++;
    }
    if (!selfFound) {
      return { reached: false, votes, reason: 'candidate not in voter set' };
    }
    this._votesFor = votes;
    return {
      reached: votes >= this._votesNeeded,
      votes,
      reason: votes >= this._votesNeeded ? 'majority reached' : 'insufficient healthy voters',
    };
  }

  private _result(newPrimaryId: string | undefined): FailoverResult {
    return {
      finalState: this._state,
      newPrimaryId,
      transitions: this._transitions,
      abortReason: this._abortReason,
      votesFor: this._votesFor,
      votesNeeded: this._votesNeeded,
    };
  }
}
