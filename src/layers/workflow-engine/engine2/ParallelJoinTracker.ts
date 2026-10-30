/**
 * Workflow Engine — Parallel Gateway Fork/Join Semantics
 *
 * Structured fork/join tracking for AND gateways. The model mirrors BPMN
 * parallel gateways: a FORK clones tokens onto every outgoing edge; the
 * matching JOIN releases when ALL expected branch tokens arrive.
 *
 * Semantics implemented:
 *
 *  - `fork(gatewayId, branchIds)` — opens a join context recording the
 *    exact set of branches that must arrive. Returns the context.
 *  - `arrive(gatewayId, branchId)` — marks a branch token arrived at the
 *    join. Returns `{ released, waiting }`: `released` true only when the
 *    last expected branch lands.
 *  - `cancelBranch(gatewayId, branchId)` — removes a branch from the
 *    expectation set (branch failed/merged early). The join still needs
 *    the REST — this is 'join-and' semantics, not 'first-arrives-wins'.
 *  - `onRelease` callbacks — `whenComplete(gatewayId, fn)` fires once the
 *    join releases, or when the context is closed with branches missing.
 *  - Timeout: `deadlineMs` on fork — `tick(now)` checks pending joins and
 *    fires `onTimeout` with the still-missing branches (for escalation).
 *
 * This is token bookkeeping only — it does not move execution. A runtime
 * calls `fork` when entering an AND gateway, `arrive` when each branch
 * reaches the join, and proceeds past the join when `released`.
 *
 * Complexity: all ops O(1) via a Map of join contexts; arrival tracking
 * uses a Set of pending branch ids.
 *
 * @module WorkflowEngine/Engine2
 */

export class JoinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JoinError';
  }
}

export interface JoinContext {
  readonly gatewayId: string;
  readonly instanceId: string;
  /** Branches expected to reach the join. */
  readonly expected: ReadonlySet<string>;
  /** Branches that have arrived. */
  readonly arrived: ReadonlySet<string>;
  /** Branch → arrival timestamp. */
  readonly arrivalTimes: ReadonlyMap<string, number>;
  readonly openedAt: number;
  readonly deadlineAt?: number;
  released: boolean;
  releasedAt?: number;
}

interface MutableJoin {
  gatewayId: string;
  instanceId: string;
  expected: Set<string>;
  arrived: Set<string>;
  arrivalTimes: Map<string, number>;
  openedAt: number;
  deadlineAt?: number;
  released: boolean;
  releasedAt?: number;
}

export interface ArriveResult {
  readonly released: boolean;
  /** Branch ids still awaited when released is false. */
  readonly waiting: ReadonlyArray<string>;
}

export interface ParallelJoinOptions {
  clock?: () => number;
  /** Called once when a join releases (all branches arrived). */
  onRelease?: (ctx: JoinContext) => void;
  /** Called when a join passes its deadline with branches missing. */
  onTimeout?: (ctx: JoinContext, missing: string[]) => void;
}

export class ParallelJoinTracker {
  private readonly _clock: () => number;
  private readonly _onRelease?: (ctx: JoinContext) => void;
  private readonly _onTimeout?: (ctx: JoinContext, missing: string[]) => void;
  /** joinKey → mutable join state */
  private readonly _joins = new Map<string, MutableJoin>();
  /** joinKeys that already timed out (fire onTimeout once). */
  private readonly _timedOut = new Set<string>();

  constructor(options: ParallelJoinOptions = {}) {
    this._clock = options.clock ?? Date.now;
    this._onRelease = options.onRelease;
    this._onTimeout = options.onTimeout;
  }

  private _key(instanceId: string, gatewayId: string): string {
    return `${instanceId}:${gatewayId}`;
  }

  /**
   * Open a join context for `gatewayId` — one per (instance, gateway).
   * `branchIds` is the exact set of outgoing branches that must arrive.
   */
  fork(
    instanceId: string,
    gatewayId: string,
    branchIds: ReadonlyArray<string>,
    deadlineMs?: number
  ): JoinContext {
    const key = this._key(instanceId, gatewayId);
    if (this._joins.has(key)) {
      throw new JoinError(`join ${key} already open`);
    }
    if (branchIds.length === 0) {
      throw new JoinError(`join ${key} requires at least one branch`);
    }
    const now = this._clock();
    const join: MutableJoin = {
      gatewayId,
      instanceId,
      expected: new Set(branchIds),
      arrived: new Set(),
      arrivalTimes: new Map(),
      openedAt: now,
      deadlineAt: deadlineMs !== undefined ? now + deadlineMs : undefined,
      released: false,
    };
    this._joins.set(key, join);
    return this._view(join);
  }

  /**
   * A branch token reached the join. Releases when all expected branches
   * have arrived. Arriving on a released join is a no-op success.
   */
  arrive(instanceId: string, gatewayId: string, branchId: string): ArriveResult {
    const join = this._mustGet(instanceId, gatewayId);
    if (join.released) {
      return { released: true, waiting: [] };
    }
    if (!join.expected.has(branchId)) {
      throw new JoinError(`branch '${branchId}' not expected at join ${this._key(instanceId, gatewayId)}`);
    }
    if (!join.arrived.has(branchId)) {
      join.arrived.add(branchId);
      join.arrivalTimes.set(branchId, this._clock());
    }
    const waiting = [...join.expected].filter((b) => !join.arrived.has(b));
    if (waiting.length === 0) {
      join.released = true;
      join.releasedAt = this._clock();
      this._onRelease?.(this._view(join));
      return { released: true, waiting: [] };
    }
    return { released: false, waiting };
  }

  /**
   * Remove a branch from the expectation set — e.g. its task failed and
   * was compensated/skipped upstream. If no branches remain expected,
   * the join releases immediately.
   */
  cancelBranch(instanceId: string, gatewayId: string, branchId: string): ArriveResult {
    const join = this._mustGet(instanceId, gatewayId);
    if (join.released) {
      return { released: true, waiting: [] };
    }
    join.expected.delete(branchId);
    join.arrived.delete(branchId);
    join.arrivalTimes.delete(branchId);
    const waiting = [...join.expected].filter((b) => !join.arrived.has(b));
    if (waiting.length === 0 && join.expected.size === 0) {
      join.released = true;
      join.releasedAt = this._clock();
      this._onRelease?.(this._view(join));
      return { released: true, waiting: [] };
    }
    return { released: waiting.length === 0, waiting };
  }

  /**
   * Check join deadlines. Call periodically (or from a scheduler tick).
   * Fires `onTimeout` once per overdue, unreleased join.
   */
  tick(): ReadonlyArray<{ instanceId: string; gatewayId: string; missing: string[] }> {
    const now = this._clock();
    const expired: { instanceId: string; gatewayId: string; missing: string[] }[] = [];
    for (const [key, join] of this._joins) {
      if (join.released || join.deadlineAt === undefined || this._timedOut.has(key)) {
        continue;
      }
      if (now >= join.deadlineAt) {
        const missing = [...join.expected].filter((b) => !join.arrived.has(b));
        this._timedOut.add(key);
        expired.push({ instanceId: join.instanceId, gatewayId: join.gatewayId, missing });
        this._onTimeout?.(this._view(join), missing);
      }
    }
    return expired;
  }

  /** Snapshot of a join's state (undefined if unknown). */
  state(instanceId: string, gatewayId: string): JoinContext | undefined {
    const join = this._joins.get(this._key(instanceId, gatewayId));
    return join ? this._view(join) : undefined;
  }

  /** All open (unreleased) joins. */
  pending(): ReadonlyArray<JoinContext> {
    return [...this._joins.values()].filter((j) => !j.released).map((j) => this._view(j));
  }

  private _mustGet(instanceId: string, gatewayId: string): MutableJoin {
    const join = this._joins.get(this._key(instanceId, gatewayId));
    if (!join) {
      throw new JoinError(`no join open for ${this._key(instanceId, gatewayId)}`);
    }
    return join;
  }

  private _view(j: MutableJoin): JoinContext {
    return {
      gatewayId: j.gatewayId,
      instanceId: j.instanceId,
      expected: new Set(j.expected),
      arrived: new Set(j.arrived),
      arrivalTimes: new Map(j.arrivalTimes),
      openedAt: j.openedAt,
      deadlineAt: j.deadlineAt,
      released: j.released,
      releasedAt: j.releasedAt,
    };
  }
}
