/**
 * Onboarding Flow Types
 *
 * Core types for the flow engine: step graphs, per-user progress state,
 * requirement predicates, A/B variants, and funnel metrics.
 *
 * @module OnboardingLayer/Flow
 */

/** Unique step id within a flow definition. */
export type StepId = string;

/**
 * A predicate over user context data. Evaluated to decide conditional step
 * inclusion and branching.
 */
export type Predicate = (ctx: Readonly<Record<string, unknown>>) => boolean;

/** Built-in predicate helpers. */
export const Predicates = {
  always: (): Predicate => () => true,
  never: (): Predicate => () => false,
  /** ctx[key] === value */
  eq: (key: string, value: unknown): Predicate =>
    (ctx) => ctx[key] === value,
  /** ctx[key] is truthy */
  truthy: (key: string): Predicate => (ctx) => Boolean(ctx[key]),
  /** ctx[key] is a number >= min */
  atLeast: (key: string, min: number): Predicate =>
    (ctx) => typeof ctx[key] === 'number' && (ctx[key] as number) >= min,
  and: (...ps: Predicate[]): Predicate => (ctx) => ps.every((p) => p(ctx)),
  or: (...ps: Predicate[]): Predicate => (ctx) => ps.some((p) => p(ctx)),
  not: (p: Predicate): Predicate => (ctx) => !p(ctx),
};

/**
 * One step in a flow. `next` may be:
 *   - a StepId (linear edge)
 *   - a Branch: predicate → StepId (first match wins)
 *   - undefined → end of flow
 */
export interface FlowStep {
  readonly id: StepId;
  readonly title: string;
  /** Skip condition: if true at visit time the step auto-completes. */
  readonly skippable?: boolean;
  /** Inclusion predicate: step only exists in the user's path when true. */
  readonly requiredWhen?: Predicate;
  /** Outgoing edge(s). */
  readonly next?: StepId | readonly Branch[];
  /** Optional validation hook run before the step may complete. */
  readonly validate?: (data: unknown) => string | null;
}

/** Conditional edge: when `when` is true, go `to`. */
export interface Branch {
  readonly when: Predicate;
  readonly to: StepId;
}

/**
 * A versioned flow definition — the static graph.
 */
export interface FlowDefinition {
  readonly flowId: string;
  readonly version: number;
  /** Entry point. */
  readonly start: StepId;
  readonly steps: readonly FlowStep[];
  /**
   * Ordered variants for A/B flow-order experiments. The engine hashes
   * (userId, flowId) to pick one deterministically.
   */
  readonly variants?: readonly FlowVariant[];
}

/**
 * A variant overrides the default step ORDER (not membership) for an
 * experiment bucket.
 */
export interface FlowVariant {
  readonly variantId: string;
  /** Fraction of users [0,1) assigned here; variants must sum ≤ 1. */
  readonly weight: number;
  /** Explicit step order for this variant (must be a permutation of ids). */
  readonly stepOrder?: readonly StepId[];
}

/** Lifecycle of a step within a user's run. */
export type StepStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'failed';

/** Per-step progress record. */
export interface StepProgress {
  readonly stepId: StepId;
  status: StepStatus;
  startedAt: number | null;
  completedAt: number | null;
  /** Validation error when status='failed'. */
  error?: string;
}

/** Overall run states. */
export type RunState = 'not-started' | 'in-progress' | 'completed' | 'abandoned';

/** A user's persisted, resumable flow run. */
export interface FlowRun {
  readonly runId: string;
  readonly flowId: string;
  readonly userId: string;
  readonly variantId: string | null;
  state: RunState;
  /** Ordered step ids resolved for this run (variant order applied). */
  readonly stepOrder: StepId[];
  /** Position in stepOrder. */
  cursor: number;
  readonly steps: Map<StepId, StepProgress>;
  readonly startedAt: number;
  /** Last activity timestamp — drives abandoned-flow detection. */
  lastActiveAt: number;
  completedAt: number | null;
  /** Arbitrary data carried across steps (form fields etc.). */
  readonly data: Record<string, unknown>;
}

/** Funnel metrics per step. */
export interface StepFunnel {
  readonly stepId: StepId;
  readonly entered: number;
  readonly completed: number;
  readonly skipped: number;
  readonly failed: number;
  /** completed+skipped / entered — 1.0 when nothing entered. */
  readonly passRate: number;
}

/** A scheduled reminder for an abandoned run. */
export interface Reminder {
  readonly runId: string;
  readonly userId: string;
  readonly flowId: string;
  readonly sendAt: number;
  sent: boolean;
}

/** Injectable clock. */
export interface Clock {
  now(): number;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

export class FlowError extends Error {
  constructor(
    public readonly code:
      | 'FLOW_NOT_FOUND'
      | 'RUN_NOT_FOUND'
      | 'INVALID_FLOW'
      | 'STEP_NOT_FOUND'
      | 'STEP_FAILED'
      | 'RUN_COMPLETED'
      | 'RUN_ABANDONED',
    message: string
  ) {
    super(message);
    this.name = 'FlowError';
  }
}
