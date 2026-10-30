/**
 * Saga Engine — shared types.
 *
 * The saga layer already ships a `SagaOrchestrator` (linear step execution
 * with compensation on failure) and a `SagaStateMachine` (a generic
 * transition table). This engine adds the SECOND, stricter orchestrator:
 *
 *   - Explicit lifecycle state machine:
 *       started → running → compensating → completed | compensated | failed
 *     Illegal transitions throw — the machine is load-bearing, not advisory.
 *
 *   - Step definitions carrying a forward action AND a compensation
 *     handler plus per-step timeout and retry policy.
 *
 *   - Injectable clock + scheduler so timeouts and backoff are
 *     deterministic in tests (no real timers).
 *
 *   - Append-only saga log: every state transition and step event is an
 *     immutable record — the basis for replay/audit.
 *
 *   - Concurrent saga instances isolated by id, sharing definitions but
 *     never state.
 *
 * @module SagaLayer/Engine
 */

/** Lifecycle states of a saga instance. */
export type SagaLifecycle =
  | 'started'
  | 'running'
  | 'compensating'
  | 'completed'
  | 'compensated'
  | 'failed';

/**
 * Legal transitions. Anything not listed throws `IllegalTransitionError` —
 * a saga in `completed` can never go back to `running`, and `compensating`
 * can only end as `compensated` or `failed` (never `completed`).
 */
export const LEGAL_TRANSITIONS: Readonly<Record<SagaLifecycle, readonly SagaLifecycle[]>> = {
  started: ['running', 'failed'],
  running: ['completed', 'compensating', 'failed'],
  compensating: ['compensated', 'failed'],
  completed: [],
  compensated: [],
  failed: [],
};

/** Clock abstraction — injectable for deterministic tests. */
export interface SagaClock {
  now(): number;
}

/** Timer abstraction so timeouts can be simulated without real timers. */
export interface SagaScheduler {
  /**
   * Registers `fn` to run after `ms`. Returns a cancel handle.
   * Implementations may be synchronous (test scheduler) or timer-based.
   */
  setTimeout(fn: () => void, ms: number): () => void;
}

/** A step's forward and compensation behavior. */
export interface SagaStepDef<C = unknown> {
  readonly name: string;
  /** Forward action; `ctx` carries saga input + prior step outputs. */
  readonly action: (ctx: StepContext<C>) => Promise<unknown> | unknown;
  /** Compensation (undo); runs in reverse order on failure. */
  readonly compensate?: (ctx: StepContext<C>, output: unknown) => Promise<void> | void;
  /** Per-step timeout in ms (clock-based). 0 = no timeout. */
  readonly timeoutMs?: number;
  /** Retries before the step is declared failed (then compensating). */
  readonly retries?: number;
  /** Backoff between retries: attempt n waits baseMs * factor^(n-1). */
  readonly retryBackoffBaseMs?: number;
  readonly retryBackoffFactor?: number;
}

/** Context handed to actions/compensations. */
export interface StepContext<C = unknown> {
  readonly sagaId: string;
  readonly input: C;
  /** Outputs of completed steps by step name (compensations see them). */
  readonly outputs: Readonly<Record<string, unknown>>;
  /** Current step name. */
  readonly step: string;
  /** Attempt number (0 = first try). */
  readonly attempt: number;
}

/** One entry in the append-only saga log. */
export interface SagaLogEntry {
  readonly seq: number;
  readonly sagaId: string;
  readonly at: number;
  readonly kind:
    | 'state'
    | 'step_started'
    | 'step_succeeded'
    | 'step_failed'
    | 'step_retrying'
    | 'step_timed_out'
    | 'compensated_step'
    | 'compensation_failed';
  readonly state?: SagaLifecycle;
  readonly step?: string;
  readonly detail?: string;
}

/** Thrown on an illegal lifecycle transition. */
export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: SagaLifecycle,
    public readonly to: SagaLifecycle
  ) {
    super(`Illegal saga transition ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

/** Thrown when a step exceeds its `timeoutMs`. */
export class StepTimeoutError extends Error {
  constructor(
    public readonly step: string,
    public readonly timeoutMs: number
  ) {
    super(`Step "${step}" timed out after ${timeoutMs}ms`);
    this.name = 'StepTimeoutError';
  }
}

/** Thrown when a saga instance id is unknown. */
export class UnknownSagaError extends Error {
  constructor(id: string) {
    super(`Unknown saga instance "${id}"`);
    this.name = 'UnknownSagaError';
  }
}
