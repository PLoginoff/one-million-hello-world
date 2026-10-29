/**
 * Workflow runtime — an explicit-state token interpreter.
 *
 * Execution model: each workflow instance owns a set of {@link Token}s. A
 * step takes the first token, executes whatever its node means, then moves
 * (or clones/destroys) the token according to the outgoing edges:
 *
 *  - task → run handler (retry loop + deadline race) → token follows the
 *    single outgoing edge; `loopWhile` requeues the token on the same node.
 *  - xor → token follows the first matching conditioned edge, else default.
 *  - and → token is cloned onto every outgoing edge (fork); when an AND
 *    node has >1 incoming edge it acts as a join — arriving tokens merge
 *    and only the last proceeds.
 *  - subflow → runs the referenced definition inline (same engine, child
 *    instance pinned to the resolved version) → token continues.
 *  - end → token dies; when the last token dies the instance completes,
 *    running the end node's output mapping.
 *
 * Failure model: an unrecoverable task error marks the instance `failed`,
 * then compensation runs LIFO over the {@link CompensationEntry} stack —
 * saga rollback. Compensation failures are recorded but do not halt the
 * unwind (best-effort semantics, like most BPM engines).
 *
 * Timers: task deadlines are implemented by racing the handler promise
 * against an injectable timer source — tests drive time manually via
 * {@link ManualTimerScheduler}.
 *
 * Suspend/resume: `suspend()` freezes scheduling; `snapshot()` returns a
 * serializable copy of instance state (handlers excluded — definitions are
 * looked up by id+version on restore).
 *
 * @module WorkflowEngine/Implementations
 */

import {
  AndGatewayNode,
  CompensationEntry,
  EdgeCondition,
  EndNode,
  FlowEdge,
  FlowNode,
  SubflowNode,
  TaskContext,
  TaskNode,
  TaskRecord,
  Token,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowEventListener,
  WorkflowInstanceState,
  WorkflowVariables,
  validateDefinition,
} from '../domain/workflow-model';

/* ------------------------------------------------------------------ */
/* Timer abstraction                                                   */
/* ------------------------------------------------------------------ */

export interface TimerHandle {
  cancel(): void;
}

/** Abstraction over setTimeout — inject for deterministic tests. */
export interface TimerScheduler {
  schedule(afterMs: number, fn: () => void): TimerHandle;
  now(): number;
}

/** Real timers + Date.now. */
export class SystemTimerScheduler implements TimerScheduler {
  schedule(afterMs: number, fn: () => void): TimerHandle {
    const t = setTimeout(fn, afterMs);
    return { cancel: () => clearTimeout(t) };
  }
  now(): number {
    return Date.now();
  }
}

/**
 * Manually-driven timer for tests: `advance(ms)` fires every scheduled
 * callback whose deadline falls within the window, in deadline order.
 */
export class ManualTimerScheduler implements TimerScheduler {
  private _now = 0;
  private _pending: { deadline: number; fn: () => void; cancelled: boolean }[] = [];

  now(): number {
    return this._now;
  }

  schedule(afterMs: number, fn: () => void): TimerHandle {
    const entry = { deadline: this._now + afterMs, fn, cancelled: false };
    this._pending.push(entry);
    // Always queue a due-check in autofire mode: entries whose deadline
    // already passed (scheduled after advance() moved the clock) fire on
    // the next microtask; future entries wait for advance() to queue a drain.
    if (this._autofire) {
      queueMicrotask(() => this._drainDue());
    }
    return { cancel: () => (entry.cancelled = true) };
  }

  /**
   * When true (default), scheduled callbacks fire automatically on the
   * microtask queue once `advance()` has moved time past their deadline —
   * i.e. `advance` marks them due and the next microtick drains them. This
   * lets deadline-race code work with a simple `await` between steps while
   * remaining fully deterministic.
   *
   * Set false for explicit `advance()`-only firing.
   */
  private _autofire = true;
  get autofire(): boolean {
    return this._autofire;
  }
  set autofire(v: boolean) {
    this._autofire = v;
  }

  advance(ms: number): void {
    const target = this._now + ms;
    if (this._autofire) {
      // Just move the clock — due entries drain on the next microtask,
      // letting deadline races interleave with pending handler promises.
      this._now = target;
      queueMicrotask(() => this._drainDue());
    } else {
      // Fire in deadline order; newly scheduled timers inside callbacks fire
      // too if they fit inside the window.
      for (;;) {
        const next = this._pending
          .filter((p) => !p.cancelled && p.deadline <= target)
          .sort((a, b) => a.deadline - b.deadline)[0];
        if (!next) {
          break;
        }
        this._now = next.deadline;
        next.cancelled = true;
        next.fn();
      }
      this._now = target;
      this._pending = this._pending.filter((p) => !p.cancelled);
    }
  }

  private _drainDue(): void {
    for (;;) {
      const due = this._pending
        .filter((p) => !p.cancelled && p.deadline <= this._now)
        .sort((a, b) => a.deadline - b.deadline);
      if (due.length === 0) {
        break;
      }
      for (const p of due) {
        p.cancelled = true;
        p.fn();
      }
      this._pending = this._pending.filter((p) => !p.cancelled);
      // Callbacks may have advanced the clock or scheduled more due timers.
    }
  }

  pendingCount(): number {
    return this._pending.filter((p) => !p.cancelled).length;
  }
}

/* ------------------------------------------------------------------ */
/* Registry + persistence stub                                         */
/* ------------------------------------------------------------------ */

/**
 * Definition registry. Multiple versions coexist; `get` without a version
 * returns the most recently registered one.
 */
export class WorkflowRegistry {
  private readonly _defs = new Map<string, WorkflowDefinition[]>();

  register(def: WorkflowDefinition): void {
    const problems = validateDefinition(def);
    if (problems.length > 0) {
      throw new Error(`Invalid workflow ${def.id}@${def.version}: ${problems.join('; ')}`);
    }
    const list = this._defs.get(def.id) ?? [];
    if (list.some((d) => d.version === def.version)) {
      throw new Error(`Workflow ${def.id}@${def.version} already registered`);
    }
    list.push(def);
    this._defs.set(def.id, list);
  }

  get(id: string, version?: string): WorkflowDefinition | undefined {
    const list = this._defs.get(id);
    if (!list || list.length === 0) {
      return undefined;
    }
    if (!version) {
      return list[list.length - 1];
    }
    return list.find((d) => d.version === version);
  }

  versions(id: string): string[] {
    return (this._defs.get(id) ?? []).map((d) => d.version);
  }
}

/**
 * Persistence stub — a pluggable store the runtime writes instance
 * snapshots to after every state transition. Real deployments swap in a DB
 * implementation; the contract is intentionally minimal.
 */
export interface InstanceStore {
  save(state: WorkflowInstanceState): Promise<void> | void;
  load(instanceId: string): Promise<WorkflowInstanceState | undefined> | WorkflowInstanceState | undefined;
  delete(instanceId: string): Promise<void> | void;
  list(filter?: { status?: string; workflowId?: string }): Promise<WorkflowInstanceState[]> | WorkflowInstanceState[];
}

export class InMemoryInstanceStore implements InstanceStore {
  private readonly _data = new Map<string, WorkflowInstanceState>();

  save(state: WorkflowInstanceState): void {
    // Deep-ish copy: snapshot must not alias live mutable state.
    this._data.set(state.instanceId, structuredCloneSafe(state));
  }

  load(instanceId: string): WorkflowInstanceState | undefined {
    const s = this._data.get(instanceId);
    return s ? structuredCloneSafe(s) : undefined;
  }

  delete(instanceId: string): void {
    this._data.delete(instanceId);
  }

  list(filter?: { status?: string; workflowId?: string }): WorkflowInstanceState[] {
    let out = Array.from(this._data.values());
    if (filter?.status) {
      out = out.filter((s) => s.status === filter.status);
    }
    if (filter?.workflowId) {
      out = out.filter((s) => s.workflowId === filter.workflowId);
    }
    return out.map((s) => structuredCloneSafe(s));
  }
}

function structuredCloneSafe<T>(v: T): T {
  // Variables/history are plain JSON by contract; functions live in the
  // definition, never in instance state.
  return JSON.parse(JSON.stringify(v)) as T;
}

/* ------------------------------------------------------------------ */
/* Runtime                                                             */
/* ------------------------------------------------------------------ */

export interface WorkflowRuntimeOptions {
  readonly scheduler?: TimerScheduler;
  readonly store?: InstanceStore;
  readonly onEvent?: WorkflowEventListener;
  /** Global cap on token-steps per resume call — runaway loop guard. */
  readonly maxStepsPerRun?: number;
}

let instanceCounter = 0;
let tokenCounter = 0;

export class WorkflowRuntime {
  readonly registry: WorkflowRegistry;
  private readonly _scheduler: TimerScheduler;
  private readonly _store: InstanceStore;
  private readonly _listeners: WorkflowEventListener[] = [];
  private readonly _instances = new Map<string, WorkflowInstanceState>();
  private readonly _defsByInstance = new Map<string, WorkflowDefinition>();
  private readonly _maxSteps: number;

  constructor(options: WorkflowRuntimeOptions = {}) {
    this.registry = new WorkflowRegistry();
    this._scheduler = options.scheduler ?? new SystemTimerScheduler();
    this._store = options.store ?? new InMemoryInstanceStore();
    if (options.onEvent) {
      this._listeners.push(options.onEvent);
    }
    this._maxSteps = options.maxStepsPerRun ?? 10_000;
  }

  onEvent(listener: WorkflowEventListener): () => void {
    this._listeners.push(listener);
    return () => {
      const i = this._listeners.indexOf(listener);
      if (i >= 0) {
        this._listeners.splice(i, 1);
      }
    };
  }

  /**
   * Starts an instance of `workflowId` (latest or pinned version).
   * The version is recorded on the instance — later registrations of newer
   * versions never affect in-flight runs.
   */
  async start(
    workflowId: string,
    variables: WorkflowVariables = {},
    opts: { version?: string; instanceId?: string } = {}
  ): Promise<WorkflowInstanceState> {
    const def = this.registry.get(workflowId, opts.version);
    if (!def) {
      throw new Error(`Workflow ${workflowId}${opts.version ? `@${opts.version}` : ''} not registered`);
    }
    const instanceId = opts.instanceId ?? `wf-${++instanceCounter}`;
    const state: WorkflowInstanceState = {
      instanceId,
      workflowId: def.id,
      version: def.version,
      status: 'running',
      variables: { ...variables },
      tokens: [],
      history: [],
      compensationStack: [],
      startedAt: this._scheduler.now(),
      timers: {},
      subflowRuns: [],
    };
    this._instances.set(instanceId, state);
    this._defsByInstance.set(instanceId, def);
    this._emit({ type: 'instance-started', instanceId, workflowId: def.id });

    const start = def.nodes.find((n) => n.kind === 'start');
    if (!start) {
      throw new Error(`Workflow ${def.id} has no start node`);
    }
    state.tokens.push({ id: `t-${++tokenCounter}`, nodeId: start.id });
    await this._run(instanceId);
    return this._snapshot(state);
  }

  /**
   * Suspends a running instance — its tokens stop being scheduled until
   * `resume` is called. In-flight task handlers are not interrupted.
   */
  suspend(instanceId: string): void {
    const s = this._mustGet(instanceId);
    if (s.status === 'running') {
      s.status = 'suspended';
      this._emit({ type: 'instance-suspended', instanceId });
      void this._store.save(s);
    }
  }

  /** Resumes a suspended instance and continues stepping. */
  async resume(instanceId: string): Promise<WorkflowInstanceState> {
    const s = this._mustGet(instanceId);
    if (s.status !== 'suspended') {
      return this._snapshot(s);
    }
    s.status = 'running';
    this._emit({ type: 'instance-resumed', instanceId });
    await this._run(instanceId);
    return this._snapshot(s);
  }

  /** Terminates an instance, running compensation for completed tasks. */
  async terminate(instanceId: string, reason = 'terminated by caller'): Promise<void> {
    const s = this._mustGet(instanceId);
    if (s.status === 'completed' || s.status === 'terminated') {
      return;
    }
    s.status = 'terminated';
    this._emit({ type: 'instance-terminated', instanceId, reason });
    await this._compensate(s);
    await this._store.save(s);
  }

  /**
   * Restores an instance from the store — the definition is resolved by the
   * version recorded on the snapshot so handlers reconnect correctly.
   */
  async restore(instanceId: string): Promise<WorkflowInstanceState | undefined> {
    const saved = await this._store.load(instanceId);
    if (!saved) {
      return undefined;
    }
    const def = this.registry.get(saved.workflowId, saved.version);
    if (!def) {
      throw new Error(`Cannot restore ${instanceId}: ${saved.workflowId}@${saved.version} not registered`);
    }
    this._instances.set(instanceId, saved);
    this._defsByInstance.set(instanceId, def);
    return this._snapshot(saved);
  }

  /** Serializable snapshot — state without handler references. */
  snapshot(instanceId: string): WorkflowInstanceState {
    return this._snapshot(this._mustGet(instanceId));
  }

  state(instanceId: string): WorkflowInstanceState | undefined {
    const s = this._instances.get(instanceId);
    return s ? this._snapshot(s) : undefined;
  }

  /* --------------------------- interpreter --------------------------- */

  /**
   * Steps tokens until no token can advance without yielding to the event
   * loop or the instance leaves `running`. Each iteration takes the first
   * token — forked tokens push siblings on the back (BFS-ish, so parallel
   * branches interleave).
   */
  private async _run(instanceId: string): Promise<void> {
    const s = this._instances.get(instanceId);
    const def = this._defsByInstance.get(instanceId);
    if (!s || !def) {
      return;
    }

    let steps = 0;
    while (s.status === 'running' && s.tokens.length > 0) {
      if (++steps > this._maxSteps) {
        await this._fail(s, def, `exceeded ${this._maxSteps} steps — probable runaway loop`);
        return;
      }
      const token = s.tokens.shift()!;
      const node = def.nodes.find((n) => n.id === token.nodeId);
      if (!node) {
        await this._fail(s, def, `token at unknown node ${token.nodeId}`);
        return;
      }
      this._emit({ type: 'token-moved', instanceId, tokenId: token.id, nodeId: node.id });
      try {
        await this._stepNode(s, def, token, node);
      } catch (err) {
        await this._fail(s, def, err instanceof Error ? err.message : String(err));
        return;
      }
      // A suspension mid-run stops further stepping; tokens requeue is not
      // needed since we already shifted this token onward.
      if (s.status !== 'running') {
        break;
      }
      await this._store.save(s);
    }

    if (s.status === 'running' && s.tokens.length === 0) {
      // All tokens died without reaching an end → implicit completion.
      s.status = 'completed';
      s.completedAt = this._scheduler.now();
      this._emit({ type: 'instance-completed', instanceId, output: s.output });
    }
    await this._store.save(s);
  }

  private async _stepNode(
    s: WorkflowInstanceState,
    def: WorkflowDefinition,
    token: Token,
    node: FlowNode
  ): Promise<void> {
    switch (node.kind) {
      case 'start':
        this._advance(s, def, token);
        return;
      case 'end':
        this._finishEnd(s, def, token, node);
        return;
      case 'xor':
        this._stepXor(s, def, token, node);
        return;
      case 'and':
        await this._stepAnd(s, def, token, node);
        return;
      case 'task':
        await this._stepTask(s, def, token, node);
        return;
      case 'subflow':
        await this._stepSubflow(s, def, token, node);
        return;
    }
  }

  /** Follows outgoing edges for a token — default: single unconditional edge. */
  private _advance(s: WorkflowInstanceState, def: WorkflowDefinition, token: Token): void {
    const outs = def.edges.filter((e) => e.from === token.nodeId);
    if (outs.length === 0) {
      // Dead end — token dies.
      return;
    }
    for (const edge of outs) {
      if (!edge.condition || edge.condition(s.variables)) {
        token.nodeId = edge.to;
        s.tokens.push(token);
        return;
      }
    }
    const deflt = outs.find((e) => e.isDefault);
    if (deflt) {
      token.nodeId = deflt.to;
      s.tokens.push(token);
    }
    // No matched edge and no default → token dies here.
  }

  private _stepXor(
    s: WorkflowInstanceState,
    def: WorkflowDefinition,
    token: Token,
    node: { kind: 'xor'; id: string }
  ): void {
    const outs = def.edges.filter((e) => e.from === node.id);
    for (const edge of outs) {
      if (!edge.isDefault && edge.condition && edge.condition(s.variables)) {
        token.nodeId = edge.to;
        s.tokens.push(token);
        return;
      }
    }
    const deflt = outs.find((e) => e.isDefault) ?? outs.find((e) => !e.condition);
    if (deflt) {
      token.nodeId = deflt.to;
      s.tokens.push(token);
    }
  }

  /**
   * AND semantics:
   *  - ≤1 incoming edges → fork: clone token onto every outgoing edge.
   *  - >1 incoming edges → join: count arrivals; only the last one forks.
   *    Arrivals are tracked on a per-instance counter keyed by node id.
   */
  private async _stepAnd(
    s: WorkflowInstanceState,
    def: WorkflowDefinition,
    token: Token,
    node: AndGatewayNode
  ): Promise<void> {
    const ins = def.edges.filter((e) => e.to === node.id);
    if (ins.length > 1) {
      const key = `__join:${node.id}`;
      const arrivals = ((s.variables[key] as number | undefined) ?? 0) + 1;
      s.variables[key] = arrivals;
      if (arrivals < ins.length) {
        // Not all branches arrived — this token is absorbed.
        return;
      }
      delete s.variables[key];
      this._emit({ type: 'joined', instanceId: s.instanceId, gatewayId: node.id });
    }
    // Fork.
    const outs = def.edges.filter((e) => e.from === node.id);
    if (outs.length === 0) {
      return;
    }
    const branches = outs.length;
    if (branches > 1) {
      this._emit({ type: 'forked', instanceId: s.instanceId, gatewayId: node.id, branches });
    }
    outs.forEach((edge, i) => {
      const t: Token = i === 0 ? token : { id: `t-${++tokenCounter}`, nodeId: '' };
      t.nodeId = edge.to;
      s.tokens.push(t);
    });
  }

  private _finishEnd(
    s: WorkflowInstanceState,
    def: WorkflowDefinition,
    token: Token,
    node: EndNode
  ): void {
    // Token dies at end. If it was the last live token, instance completes.
    if (s.tokens.length === 0) {
      s.output = node.output ? node.output(s.variables) : s.variables;
      s.status = 'completed';
      s.completedAt = this._scheduler.now();
      this._emit({ type: 'instance-completed', instanceId: s.instanceId, output: s.output });
    }
    void def;
    void token;
  }

  /**
   * Executes a task with the retry loop, deadline race and loopWhile.
   * Deadlines race via the injected scheduler — no reliance on wall clock.
   */
  private async _stepTask(
    s: WorkflowInstanceState,
    def: WorkflowDefinition,
    token: Token,
    node: TaskNode
  ): Promise<void> {
    const rec: TaskRecord = {
      nodeId: node.id,
      startedAt: this._scheduler.now(),
      attempts: 0,
    };
    const retry = node.retry;
    const maxAttempts = retry?.maxAttempts ?? 1;

    let output: unknown;
    let loopIterations = 0;
    const maxLoops = node.maxLoopIterations ?? 100;

    for (;;) {
      let attempt = 0;
      let lastError: unknown;
      let succeeded = false;
      let timedOut = false;
      let escalated = false;

      while (attempt < maxAttempts && !succeeded) {
        attempt++;
        rec.attempts = attempt;
        this._emit({ type: 'task-started', instanceId: s.instanceId, nodeId: node.id, attempt });
        const ctx = this._taskContext(s, node, attempt);
        try {
          output = await this._runWithDeadline(s, node, ctx, () => node.handler(ctx));
          succeeded = true;
          rec.timedOut = timedOut;
        } catch (err) {
          if (err instanceof DeadlineExceeded) {
            timedOut = true;
            rec.timedOut = true;
            if (node.deadline?.action === 'escalate' && node.deadline.escalateTo) {
              output = await node.deadline.escalateTo(ctx);
              succeeded = true;
              escalated = true;
              rec.escalated = true;
              this._emit({ type: 'task-escalated', instanceId: s.instanceId, nodeId: node.id });
              break;
            }
            if (node.deadline?.action === 'skip') {
              output = undefined;
              succeeded = true;
              rec.skipped = true;
              break;
            }
            lastError = err;
          } else {
            lastError = err;
          }
          const willRetry =
            attempt < maxAttempts &&
            retry !== undefined &&
            (!retry.retryableIf || retry.retryableIf(lastError));
          this._emit({
            type: 'task-failed',
            instanceId: s.instanceId,
            nodeId: node.id,
            error: errMessage(lastError),
            willRetry,
          });
          if (!willRetry) {
            break;
          }
          if (retry) {
            const delay =
              retry.strategy === 'exponential' ? retry.backoffMs * 2 ** (attempt - 1) : retry.backoffMs;
            if (delay > 0) {
              await this._sleep(delay);
            }
          }
        }
      }

      if (!succeeded) {
        rec.error = errMessage(lastError);
        rec.completedAt = this._scheduler.now();
        s.history.push(rec);
        throw lastError instanceof Error ? lastError : new Error(errMessage(lastError));
      }

      // Apply output mapping each iteration so loopWhile sees fresh vars.
      const updates = node.output
        ? node.output(output, s.variables)
        : { [node.id]: output };
      Object.assign(s.variables, updates);

      loopIterations++;
      rec.loopIterations = loopIterations;

      // loopWhile: if the guard still holds, re-run the task — up to cap.
      if (node.loopWhile && node.loopWhile(s.variables) && loopIterations < maxLoops) {
        continue;
      }
      break;
    }

    rec.completedAt = this._scheduler.now();
    rec.output = output;
    s.history.push(rec);

    // Record compensation once, with the final output.
    if (node.compensation) {
      s.compensationStack.push({
        nodeId: node.id,
        output,
        variablesSnapshot: { ...s.variables },
      });
    }
    this._emit({ type: 'task-completed', instanceId: s.instanceId, nodeId: node.id, output });
    this._advance(s, def, token);
  }

  private async _stepSubflow(
    s: WorkflowInstanceState,
    def: WorkflowDefinition,
    token: Token,
    node: SubflowNode
  ): Promise<void> {
    const childVars = node.input ? node.input(s.variables) : { ...s.variables };
    const child = await this.start(node.workflowId, childVars, { version: node.version });
    s.subflowRuns.push({
      nodeId: node.id,
      childInstanceId: child.instanceId,
      workflowId: node.workflowId,
    });
    if (child.status === 'failed' || child.status === 'terminated') {
      throw new Error(`subflow ${node.workflowId} failed: ${child.error ?? 'unknown'}`);
    }
    const updates = node.output ? node.output(child.output, s.variables) : { [node.id]: child.output };
    Object.assign(s.variables, updates);
    if (node.compensation) {
      s.compensationStack.push({
        nodeId: node.id,
        output: child.output,
        variablesSnapshot: { ...s.variables },
      });
    }
    this._advance(s, def, token);
  }

  /**
   * Races a task handler against its deadline. The timer is driven by the
   * injected scheduler — tests using {@link ManualTimerScheduler} must
   * `advance()` to trigger expiry (typically alongside the handler promise).
   */
  private _runWithDeadline<T>(
    s: WorkflowInstanceState,
    node: TaskNode,
    ctx: TaskContext,
    work: () => Promise<unknown> | unknown
  ): Promise<T> {
    const deadline = node.deadline;
    if (!deadline) {
      return Promise.resolve(work()) as Promise<T>;
    }
    return new Promise<T>((resolve, reject) => {
      const handle = this._scheduler.schedule(deadline.afterMs, () => {
        delete s.timers[node.id];
        reject(new DeadlineExceeded(node.id, deadline.afterMs));
        // Rejections inside scheduler callbacks can otherwise surface as
        // unhandled if the race is already decided — the .then chain below
        // still owns this promise, so this is purely defensive.
      });
      s.timers[node.id] = this._scheduler.now() + deadline.afterMs;
      Promise.resolve(work()).then(
        (v) => {
          handle.cancel();
          delete s.timers[node.id];
          resolve(v as T);
        },
        (e) => {
          handle.cancel();
          delete s.timers[node.id];
          reject(e instanceof Error ? e : new Error(errMessage(e)));
        }
      );
    });
  }

  private _taskContext(s: WorkflowInstanceState, node: TaskNode, attempt: number): TaskContext {
    return {
      variables: s.variables,
      input: node.input ? node.input(s.variables) : s.variables,
      instanceId: s.instanceId,
      nodeId: node.id,
      attempt,
    };
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this._scheduler.schedule(ms, resolve);
    });
  }

  /* --------------------------- failures --------------------------- */

  private async _fail(s: WorkflowInstanceState, def: WorkflowDefinition, message: string): Promise<void> {
    s.status = 'failed';
    s.error = message;
    s.completedAt = this._scheduler.now();
    this._emit({ type: 'instance-failed', instanceId: s.instanceId, error: message });
    await this._compensate(s);
    await this._store.save(s);
    void def;
  }

  /** Runs the compensation stack LIFO — saga rollback, best-effort. */
  private async _compensate(s: WorkflowInstanceState): Promise<void> {
    const def = this._defsByInstance.get(s.instanceId);
    if (!def || s.compensationStack.length === 0) {
      return;
    }
    s.status = 'compensating';
    while (s.compensationStack.length > 0) {
      const entry = s.compensationStack.pop()!;
      const node = def.nodes.find((n) => n.id === entry.nodeId);
      const handler =
        node && (node.kind === 'task' || node.kind === 'subflow') ? node.compensation : undefined;
      if (!handler) {
        continue;
      }
      try {
        await handler(
          {
            variables: entry.variablesSnapshot,
            input: entry.variablesSnapshot,
            instanceId: s.instanceId,
            nodeId: entry.nodeId,
            attempt: 1,
          },
          entry.output
        );
        this._emit({ type: 'task-compensated', instanceId: s.instanceId, nodeId: entry.nodeId });
      } catch {
        // Compensation failure is recorded, not fatal — continue unwind.
        this._emit({
          type: 'task-failed',
          instanceId: s.instanceId,
          nodeId: entry.nodeId,
          error: 'compensation handler failed',
          willRetry: false,
        });
      }
    }
    if (s.status === 'compensating') {
      s.status = 'compensated';
      this._emit({ type: 'instance-compensated', instanceId: s.instanceId });
    }
  }

  /* --------------------------- helpers --------------------------- */

  private _mustGet(instanceId: string): WorkflowInstanceState {
    const s = this._instances.get(instanceId);
    if (!s) {
      throw new Error(`Unknown instance ${instanceId}`);
    }
    return s;
  }

  private _snapshot(s: WorkflowInstanceState): WorkflowInstanceState {
    return structuredCloneSafe(s);
  }

  private _emit(e: WorkflowEvent): void {
    for (const l of this._listeners) {
      l(e);
    }
  }
}

class DeadlineExceeded extends Error {
  constructor(nodeId: string, afterMs: number) {
    super(`task ${nodeId} exceeded deadline of ${afterMs}ms`);
    this.name = 'DeadlineExceeded';
  }
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type { EdgeCondition, CompensationEntry };
