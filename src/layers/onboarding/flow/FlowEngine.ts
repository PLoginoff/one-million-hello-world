/**
 * Flow Engine
 *
 * Orchestrates onboarding flows: start/resume runs, advance through the
 * step graph with validation + branching + skipping, persist progress for
 * resumability, assign A/B variants, track funnel metrics, and schedule
 * abandonment reminders.
 *
 * Usage:
 *   engine.registerFlow(definition);
 *   const run = engine.start('welcome', 'user-1', { plan: 'pro' });
 *   engine.currentStep(run.runId)      // step needing input
 *   engine.complete(run.runId, data)   // validate + advance
 *   engine.skip(run.runId)             // skippable steps only
 *
 * @module OnboardingLayer/Flow
 */

import {
  Clock,
  FlowDefinition,
  FlowError,
  FlowRun,
  FlowStep,
  Reminder,
  StepId,
  StepProgress,
  SystemClock,
} from './FlowTypes';
import { FlowGraph, assignVariant } from './FlowGraph';
import { RunStore, RunSnapshot } from './RunStore';
import { FunnelTracker } from './FunnelTracker';
import { ReminderScheduler, ReminderCadence, DEFAULT_CADENCE } from './ReminderScheduler';

export class FlowEngine {
  readonly runs = new RunStore();
  readonly funnel = new FunnelTracker();
  readonly reminders: ReminderScheduler;

  private readonly _graphs = new Map<string, FlowGraph>();
  private _seq = 0;

  constructor(
    private readonly _clock: Clock = new SystemClock(),
    cadence: readonly ReminderCadence[] = DEFAULT_CADENCE
  ) {
    this.reminders = new ReminderScheduler(cadence, _clock);
  }

  // ------------------------------------------------------------ flows

  registerFlow(definition: FlowDefinition): FlowGraph {
    const g = new FlowGraph(definition);
    this._graphs.set(definition.flowId, g);
    return g;
  }

  graph(flowId: string): FlowGraph {
    const g = this._graphs.get(flowId);
    if (!g) throw new FlowError('FLOW_NOT_FOUND', `flow '${flowId}' not registered`);
    return g;
  }

  // ------------------------------------------------------------ run lifecycle

  /**
   * Start a new run for `userId`. `ctx` seeds `run.data` and drives
   * `requiredWhen`/branch predicates and variant ordering.
   *
   * A user's second `start` for the same flow resumes the existing run
   * instead of duplicating — call `abandon` first to force a fresh run.
   */
  start(flowId: string, userId: string, ctx: Readonly<Record<string, unknown>> = {}): FlowRun {
    const existing = this.runs.findByUserFlow(userId, flowId);
    if (existing && existing.state === 'in-progress') return existing;

    const graph = this.graph(flowId);
    const variantId = assignVariant(userId, graph.definition);
    const order = graph.resolveOrder(variantId, ctx);

    const now = this._clock.now();
    const steps = new Map<StepId, StepProgress>();
    for (const id of order) {
      steps.set(id, { stepId: id, status: 'pending', startedAt: null, completedAt: null });
    }

    const run: FlowRun = {
      runId: `run-${++this._seq}`,
      flowId,
      userId,
      variantId,
      state: 'in-progress',
      stepOrder: order,
      cursor: 0,
      steps,
      startedAt: now,
      lastActiveAt: now,
      completedAt: null,
      data: { ...ctx },
    };
    this.runs.save(run);
    this._activateCurrent(run);
    return run;
  }

  /**
   * Resume a persisted run (same engine or a restored snapshot).
   */
  resume(runId: string): FlowRun {
    const run = this.runs.getOrThrow(runId);
    if (run.state === 'completed') {
      throw new FlowError('RUN_COMPLETED', `run '${runId}' already completed`);
    }
    if (run.state === 'abandoned') {
      run.state = 'in-progress';
    }
    // Any activity (resume/complete/skip) resets abandonment — cancel pending reminders.
    this.reminders.cancelFor(runId);
    run.lastActiveAt = this._clock.now();
    this._activateCurrent(run);
    return run;
  }

  /**
   * Snapshot a run for durable storage; {@link restoreRun} rehydrates it.
   */
  snapshotRun(runId: string): RunSnapshot {
    return this.runs.snapshot(runId);
  }

  restoreRun(snap: RunSnapshot): FlowRun {
    return this.runs.restore(snap);
  }

  /**
   * The step the user must complete next, or null when the run finished.
   */
  currentStep(runId: string): FlowStep | null {
    const run = this.runs.getOrThrow(runId);
    if (run.state !== 'in-progress') return null;
    const id = run.stepOrder[run.cursor];
    return id !== undefined ? this.graph(run.flowId).step(id) : null;
  }

  /**
   * Complete the current step. Runs the step's `validate` hook on `data`;
   * a returned string marks the step failed and throws. On success, merges
   * `data` into run.data, marks completed, advances through any auto-
   * skippable steps, and may finish the run.
   */
  complete(runId: string, data?: unknown): FlowRun {
    const run = this._assertActive(runId);
    const step = this.currentStep(runId);
    if (!step) throw new FlowError('RUN_COMPLETED', 'no active step');

    if (step.validate) {
      const err = step.validate(data);
      if (err !== null) {
        this._progress(run, step.id).status = 'failed';
        this._progress(run, step.id).error = err;
        this.funnel.record(run.flowId, step.id, 'failed');
        throw new FlowError('STEP_FAILED', `step '${step.id}' validation failed: ${err}`);
      }
    }

    const now = this._clock.now();
    if (data !== undefined && typeof data === 'object' && data !== null) {
      Object.assign(run.data, data);
    }
    const p = this._progress(run, step.id);
    p.status = 'completed';
    p.completedAt = now;
    this.funnel.record(run.flowId, step.id, 'completed');
    run.lastActiveAt = now;
    this._advance(run);
    return run;
  }

  /**
   * Skip the current step — allowed only when `skippable` is true.
   */
  skip(runId: string): FlowRun {
    const run = this._assertActive(runId);
    const step = this.currentStep(runId);
    if (!step) throw new FlowError('RUN_COMPLETED', 'no active step');
    if (!step.skippable) {
      throw new FlowError('STEP_FAILED', `step '${step.id}' is not skippable`);
    }
    const p = this._progress(run, step.id);
    p.status = 'skipped';
    p.completedAt = this._clock.now();
    this.funnel.record(run.flowId, step.id, 'skipped');
    run.lastActiveAt = this._clock.now();
    this._advance(run);
    return run;
  }

  /**
   * Abandon a run explicitly (user quit / cancelled).
   */
  abandon(runId: string): FlowRun {
    const run = this.runs.getOrThrow(runId);
    if (run.state === 'in-progress') {
      run.state = 'abandoned';
      const cur = run.stepOrder[run.cursor];
      if (cur) {
        const p = this._progress(run, cur);
        if (p.status === 'active') p.status = 'pending';
      }
    }
    return run;
  }

  /**
   * Runs idle longer than `idleMs` are marked abandoned — call from a sweep.
   */
  markAbandoned(idleMs: number): number {
    const now = this._clock.now();
    let n = 0;
    for (const run of this.runs.all('in-progress')) {
      if (now - run.lastActiveAt >= idleMs) {
        run.state = 'abandoned';
        n++;
      }
    }
    return n;
  }

  /**
   * Scan in-progress runs and schedule cadence reminders; returns the new
   * ones. Idle runs stay 'in-progress' until {@link markAbandoned} runs.
   */
  scheduleReminders(): readonly Reminder[] {
    return this.reminders.schedule(this.runs.all('in-progress'));
  }

  /** Progress percent [0,1] for a run (completed+skipped / total). */
  progress(runId: string): number {
    const run = this.runs.getOrThrow(runId);
    if (run.stepOrder.length === 0) return 1;
    let done = 0;
    for (const p of run.steps.values()) {
      if (p.status === 'completed' || p.status === 'skipped') done++;
    }
    return done / run.stepOrder.length;
  }

  // ------------------------------------------------------------ internals

  private _assertActive(runId: string): FlowRun {
    const run = this.runs.getOrThrow(runId);
    if (run.state === 'completed') throw new FlowError('RUN_COMPLETED', `run '${runId}' completed`);
    if (run.state === 'abandoned') throw new FlowError('RUN_ABANDONED', `run '${runId}' abandoned`);
    return run;
  }

  private _progress(run: FlowRun, stepId: StepId): StepProgress {
    return run.steps.get(stepId)!;
  }

  /**
   * Move the cursor past the just-finished step, then auto-resolve:
   *   - follow `next` edges (branches evaluated against run.data)
   *   - auto-skip steps with `skippable` whose `requiredWhen` excluded them
   *     already handled by order resolution
   */
  private _advance(run: FlowRun): void {
    const graph = this.graph(run.flowId);
    const fromId = run.stepOrder[run.cursor];
    const idx = graph.nextIndex(fromId, run.stepOrder, run.data);
    run.cursor = idx;
    if (run.cursor >= run.stepOrder.length) {
      this._finish(run);
      return;
    }
    this._activateCurrent(run);
  }

  /**
   * Activate the step under the cursor and record funnel entry. Skips over
   * `skippable` steps whose requiredWhen predicate now evaluates false
   * (data may have changed since order resolution).
   */
  private _activateCurrent(run: FlowRun): void {
    const graph = this.graph(run.flowId);
    while (run.cursor < run.stepOrder.length) {
      const id = run.stepOrder[run.cursor];
      const step = graph.step(id);
      if (!step) {
        run.cursor++;
        continue;
      }
      if (step.requiredWhen && !step.requiredWhen(run.data)) {
        const p = this._progress(run, id);
        p.status = 'skipped';
        p.completedAt = this._clock.now();
        this.funnel.record(run.flowId, id, 'skipped');
        run.cursor++;
        continue;
      }
      const p = this._progress(run, id);
      if (p.status === 'pending') {
        p.status = 'active';
        p.startedAt = this._clock.now();
        this.funnel.record(run.flowId, id, 'entered');
      }
      return;
    }
    this._finish(run);
  }

  private _finish(run: FlowRun): void {
    run.state = 'completed';
    run.completedAt = this._clock.now();
    run.cursor = run.stepOrder.length;
    this.reminders.cancelFor(run.runId);
    this.runs.save(run);
  }
}
