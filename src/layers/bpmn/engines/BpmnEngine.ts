/**
 * BPMN Token Execution Engine
 *
 * Executes a process definition with real token semantics:
 *
 *  - **Start event** spawns a token which flows along sequence flows.
 *  - **Task** invokes a registered handler; the token continues after
 *    completion (async handlers supported).
 *  - **Exclusive gateway (XOR)**: evaluates outgoing flow conditions in
 *    declaration order; first true condition wins; `isDefault` flow is
 *    the fallback. Exactly one outgoing flow is taken.
 *  - **Parallel split (AND fork)**: one token per outgoing flow.
 *  - **Parallel join (AND join)**: a token arriving on an inbound flow
 *    parks as `waiting`; the join fires only when EVERY inbound flow
 *    holds a waiting token — then all are consumed and a single token
 *    proceeds. This is real join semantics: the join truly blocks until
 *    all branches arrive.
 *  - **Inclusive split (OR fork)**: every outgoing flow whose condition
 *    is true gets a token (default flow when none match).
 *  - **Inclusive join (OR join)**: waits until every inbound flow that
 *    can still produce a token has produced one — computed by checking
 *    whether upstream tokens can still reach the join.
 *  - **Sub-process**: token enters the child scope at its start event;
 *    the child's end event returns the token to the parent's flow.
 *  - **Timer event**: parks the token until `resumeAt`; `advanceTime()`
 *    resumes all due timers (clock is injected).
 *  - **Error events**: a task throwing {@link BpmnError} with a matching
 *    boundary ErrorEvent interrupts the activity and diverts the token
 *    to the boundary flow. Uncaught errors fail the instance.
 *
 * @module BpmnLayer/Engines
 */

import {
  IClock,
  InstanceState,
  NodeType,
  ProcessDefinition,
  ProcessInstance,
  ProcessNode,
  SequenceFlow,
  SystemClock,
  TaskHandler,
  Token,
  TokenState,
  TraceListener,
} from './types';

let tokenSeq = 0;
let instanceSeq = 0;

function nextTokenId(): string {
  tokenSeq += 1;
  return `tok-${tokenSeq.toString(36)}`;
}

/** Error thrown by task handlers to trigger boundary error events. */
export class BpmnError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'BpmnError';
  }
}

export interface BpmnEngineOptions {
  clock?: IClock;
  taskHandler?: TaskHandler;
}

export class BpmnEngine {
  private readonly _definitions: Map<string, ProcessDefinition>;
  private readonly _instances: Map<string, ProcessInstance>;
  private readonly _handlers: Map<string, TaskHandler>;
  private readonly _defaultHandler: TaskHandler | null;
  private readonly _listeners: TraceListener[];
  private readonly _clock: IClock;

  constructor(options: BpmnEngineOptions = {}) {
    this._definitions = new Map();
    this._instances = new Map();
    this._handlers = new Map();
    this._defaultHandler = options.taskHandler ?? null;
    this._listeners = [];
    this._clock = options.clock ?? new SystemClock();
  }

  // ------------------------------------------------------------------
  // Registration
  // ------------------------------------------------------------------

  /** Register (and validate) a process definition. */
  deploy(definition: ProcessDefinition): void {
    this._validate(definition);
    this._definitions.set(definition.id, definition);
  }

  /** Register a handler for a specific task node id. */
  onTask(nodeId: string, handler: TaskHandler): void {
    this._handlers.set(nodeId, handler);
  }

  onTrace(listener: TraceListener): void {
    this._listeners.push(listener);
  }

  // ------------------------------------------------------------------
  // Execution
  // ------------------------------------------------------------------

  /**
   * Start a new process instance. Runs until the process completes,
   * parks at a timer/join, or fails.
   */
  async start(definitionId: string, variables: Record<string, unknown> = {}): Promise<ProcessInstance> {
    const def = this._definitions.get(definitionId);
    if (!def) throw new Error(`Unknown process definition: ${definitionId}`);
    const start = def.nodes.find((n) => n.type === NodeType.StartEvent && !n.attachedToRef);
    if (!start) throw new Error(`Process ${definitionId} has no start event`);

    instanceSeq += 1;
    const instance: ProcessInstance = {
      id: `pi-${instanceSeq.toString(36)}`,
      definitionId,
      state: InstanceState.Running,
      variables: new Map(Object.entries(variables)),
      tokens: [],
      trace: [],
      startedAt: this._clock.now(),
      completedAt: null,
      errorCode: null,
    };
    this._instances.set(instance.id, instance);

    const token = this._spawnToken(instance, start.id, null, null);
    await this._run(instance, def, token);
    this._checkCompletion(instance);
    return instance;
  }

  /**
   * Resume tokens whose timers expired by `now` (defaults to the clock).
   * Call after advancing the injected clock.
   */
  async advanceTime(now?: number): Promise<void> {
    const at = now ?? this._clock.now();
    for (const instance of this._instances.values()) {
      if (instance.state !== InstanceState.Running) continue;
      const def = this._definitions.get(instance.definitionId)!;
      const due = instance.tokens.filter(
        (t) => t.state === TokenState.Waiting && t.resumeAt !== null && t.resumeAt <= at
      );
      for (const token of due) {
        token.resumeAt = null;
        token.state = TokenState.Active;
        this._trace(instance, token.nodeId);
        await this._proceed(instance, def, token);
      }
      this._checkCompletion(instance);
    }
  }

  getInstance(id: string): ProcessInstance | null {
    return this._instances.get(id) ?? null;
  }

  // ------------------------------------------------------------------
  // Token lifecycle
  // ------------------------------------------------------------------

  private _spawnToken(
    instance: ProcessInstance,
    nodeId: string,
    scopeId: string | null,
    parentTokenId: string | null
  ): Token {
    const token: Token = {
      id: nextTokenId(),
      nodeId,
      scopeId,
      parentTokenId,
      state: TokenState.Active,
      resumeAt: null,
    };
    instance.tokens.push(token);
    return token;
  }

  /**
   * Drive one active token through the graph until it parks, completes,
   * or fails. New tokens spawned along the way are run immediately
   * (depth-first), matching a worklist scheduler.
   */
  private async _run(instance: ProcessInstance, def: ProcessDefinition, token: Token): Promise<void> {
    let steps = 0;
    const maxSteps = 100_000;

    while (token.state === TokenState.Active && instance.state === InstanceState.Running) {
      if (++steps > maxSteps) {
        this._fail(instance, token, 'ENGINE-LOOP-LIMIT');
        return;
      }
      const node = this._nodeInScope(def, token.scopeId, token.nodeId);
      if (!node) {
        this._fail(instance, token, `ENGINE-NO-NODE:${token.nodeId}`);
        return;
      }
      this._trace(instance, node.id);
      try {
        await this._visit(instance, def, token, node);
      } catch (err) {
        this._handleTaskError(instance, def, token, node, err);
        if (instance.state !== InstanceState.Running) return;
        if (token.state !== TokenState.Active) return;
      }
      if (instance.state !== InstanceState.Running) return;
    }
  }

  private async _visit(
    instance: ProcessInstance,
    def: ProcessDefinition,
    token: Token,
    node: ProcessNode
  ): Promise<void> {
    switch (node.type) {
      case NodeType.StartEvent:
        await this._proceed(instance, def, token);
        break;

      case NodeType.EndEvent:
        this._endToken(instance, token, node);
        break;

      case NodeType.Task: {
        const handler = this._handlers.get(node.id) ?? this._defaultHandler;
        if (handler) await handler(node.id, instance.variables);
        await this._proceed(instance, def, token);
        break;
      }

      case NodeType.ExclusiveGateway:
        this._exclusiveSplit(instance, def, token, node);
        break;

      case NodeType.ParallelGateway:
        if (this._isJoin(def, token.scopeId, node.id)) {
          await this._joinArrive(instance, def, token, node, 'and');
        } else {
          await this._forkAll(instance, def, token, node);
        }
        break;

      case NodeType.InclusiveGateway:
        if (this._isJoin(def, token.scopeId, node.id)) {
          await this._joinArrive(instance, def, token, node, 'or');
        } else {
          await this._inclusiveSplit(instance, def, token, node);
        }
        break;

      case NodeType.SubProcess:
        await this._enterSubProcess(instance, def, token, node);
        break;

      case NodeType.TimerEvent:
        token.state = TokenState.Waiting;
        token.resumeAt = this._clock.now() + (node.timerDurationMs ?? 0);
        break;

      case NodeType.ErrorEvent:
        if (node.attachedToRef) {
          // Boundary event — token arrived here via error handling.
          await this._proceed(instance, def, token);
        } else {
          // Throw error event — fails the instance.
          this._fail(instance, token, node.errorCode ?? 'ERROR');
        }
        break;
    }
  }

  // ------------------------------------------------------------------
  // Flow helpers
  // ------------------------------------------------------------------

  private _scopeOf(def: ProcessDefinition, scopeId: string | null): ProcessDefinition {
    if (scopeId === null) return def;
    const sub = def.nodes.find((n) => n.id === scopeId && n.type === NodeType.SubProcess);
    if (!sub || !sub.children) throw new Error(`Unknown scope: ${scopeId}`);
    return sub.children;
  }

  private _nodeInScope(
    def: ProcessDefinition,
    scopeId: string | null,
    nodeId: string
  ): ProcessNode | null {
    const scope = this._scopeOf(def, scopeId);
    // Boundary events live in the parent scope referencing child nodes.
    const local = scope.nodes.find((n) => n.id === nodeId);
    if (local) return local;
    if (scopeId !== null) {
      return def.nodes.find((n) => n.id === nodeId) ?? null;
    }
    return null;
  }

  private _outgoing(def: ProcessDefinition, scopeId: string | null, nodeId: string): SequenceFlow[] {
    return this._scopeOf(def, scopeId).flows.filter((f) => f.sourceRef === nodeId);
  }

  private _incoming(def: ProcessDefinition, scopeId: string | null, nodeId: string): SequenceFlow[] {
    return this._scopeOf(def, scopeId).flows.filter((f) => f.targetRef === nodeId);
  }

  private _isJoin(def: ProcessDefinition, scopeId: string | null, nodeId: string): boolean {
    return this._incoming(def, scopeId, nodeId).length > 1;
  }

  /** Move token along outgoing flow(s) — non-gateway nodes have exactly one. */
  private async _proceed(instance: ProcessInstance, def: ProcessDefinition, token: Token): Promise<void> {
    const flows = this._outgoing(def, token.scopeId, token.nodeId);
    if (flows.length === 0) {
      // Implicit end — token terminates at a dead-end node.
      token.state = TokenState.Completed;
      return;
    }
    if (flows.length === 1) {
      this._moveTo(instance, token, flows[0]!.targetRef);
      await this._run(instance, def, token); // continue downstream
      return;
    }
    // Multiple unconditional flows on a non-gateway node: treat as AND.
    await this._forkAll(instance, def, token, this._nodeInScope(def, token.scopeId, token.nodeId)!);
  }

  /**
   * Transition a token to a new node, recording which node it arrived
   * FROM — join semantics need the inbound source per waiting token.
   */
  private _moveTo(instance: ProcessInstance, token: Token, targetId: string): void {
    this._arrivalMap(instance).set(token.id, token.nodeId);
    token.nodeId = targetId;
  }

  // ------------------------------------------------------------------
  // Gateway semantics
  // ------------------------------------------------------------------

  private _evaluateCondition(flow: SequenceFlow, variables: Map<string, unknown>): boolean {
    if (flow.condition === null || flow.condition.trim() === '') return true;
    const m = flow.condition.trim().match(/^([\w.]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (!m) {
      // Bare variable name → truthiness.
      return Boolean(variables.get(flow.condition.trim()));
    }
    const varName = m[1]!;
    const op = m[2]!;
    const raw = m[3]!.trim();
    const left = variables.get(varName);
    const right: unknown = /^-?\d+(\.\d+)?$/.test(raw)
      ? Number(raw)
      : raw.replace(/^['"]|['"]$/g, '');
    switch (op) {
      case '==': return left === right || String(left) === String(right);
      case '!=': return !(left === right || String(left) === String(right));
      case '>': return Number(left) > Number(right);
      case '<': return Number(left) < Number(right);
      case '>=': return Number(left) >= Number(right);
      case '<=': return Number(left) <= Number(right);
    }
    return false;
  }

  /** XOR: exactly one outgoing flow. */
  private _exclusiveSplit(
    instance: ProcessInstance,
    def: ProcessDefinition,
    token: Token,
    node: ProcessNode
  ): void {
    const flows = this._outgoing(def, token.scopeId, node.id);
    const conditional = flows.filter((f) => !f.isDefault);
    const defaultFlow = flows.find((f) => f.isDefault) ?? null;
    const chosen =
      conditional.find((f) => this._evaluateCondition(f, instance.variables)) ?? defaultFlow;
    if (!chosen) {
      this._fail(instance, token, `ENGINE-NO-FLOW:${node.id}`);
      return;
    }
    this._moveTo(instance, token, chosen.targetRef);
  }

  /** AND split: token per outgoing flow. */
  private async _forkAll(
    instance: ProcessInstance,
    def: ProcessDefinition,
    token: Token,
    node: ProcessNode
  ): Promise<void> {
    const flows = this._outgoing(def, token.scopeId, node.id);
    if (flows.length === 0) {
      token.state = TokenState.Completed;
      return;
    }
    const first = flows[0]!;
    // The original token takes the first branch; siblings take the rest.
    for (let i = 1; i < flows.length; i++) {
      const child = this._spawnToken(instance, flows[i]!.targetRef, token.scopeId, token.id);
      this._arrivalMap(instance).set(child.id, node.id);
      await this._run(instance, def, child);
      if (instance.state !== InstanceState.Running) {
        token.state = TokenState.Consumed;
        return;
      }
    }
    this._moveTo(instance, token, first.targetRef);
  }

  /** OR split: token per flow whose condition is true (default if none). */
  private async _inclusiveSplit(
    instance: ProcessInstance,
    def: ProcessDefinition,
    token: Token,
    node: ProcessNode
  ): Promise<void> {
    const flows = this._outgoing(def, token.scopeId, node.id);
    const conditional = flows.filter((f) => !f.isDefault);
    const taken = conditional.filter((f) => this._evaluateCondition(f, instance.variables));
    if (taken.length === 0) {
      const defaultFlow = flows.find((f) => f.isDefault);
      if (!defaultFlow) {
        this._fail(instance, token, `ENGINE-NO-FLOW:${node.id}`);
        return;
      }
      taken.push(defaultFlow);
    }
    for (let i = 1; i < taken.length; i++) {
      const child = this._spawnToken(instance, taken[i]!.targetRef, token.scopeId, token.id);
      this._arrivalMap(instance).set(child.id, node.id);
      await this._run(instance, def, child);
      if (instance.state !== InstanceState.Running) {
        token.state = TokenState.Consumed;
        return;
      }
    }
    this._moveTo(instance, token, taken[0]!.targetRef);
  }

  /**
   * Join semantics.
   *
   * AND join: parks the token; fires when every inbound flow has a
   * waiting token. All waiting tokens are consumed and one proceeds.
   *
   * OR join: same, except it fires as soon as no *other* token in the
   * instance can still reach the join — determined by checking whether
   * any non-waiting token can reach the join's inbound sources via the
   * flow graph (reachability on the active token set).
   */
  private async _joinArrive(
    instance: ProcessInstance,
    def: ProcessDefinition,
    token: Token,
    node: ProcessNode,
    kind: 'and' | 'or'
  ): Promise<void> {
    token.state = TokenState.Waiting;
    token.resumeAt = null; // joins are not time-based

    const inboundFlows = this._incoming(def, token.scopeId, node.id);
    const inboundSources = new Set(inboundFlows.map((f) => f.sourceRef));

    // Tokens already waiting at this join, keyed by the node they arrived from.
    const waitingHere = instance.tokens.filter(
      (t) =>
        t !== token &&
        t.state === TokenState.Waiting &&
        t.resumeAt === null &&
        t.nodeId === node.id &&
        t.scopeId === token.scopeId
    );

    // Collect the set of source nodes satisfied by waiting tokens.
    // Each waiting token remembers which source it came from via a map
    // keyed on token id — we store the arriving source on the token's
    // nodeId... so instead we reconstruct: a waiting token at the join
    // satisfies the inbound flow whose source equals the token's
    // `lastNode` which we keep in a side map.
    const arrivedFrom = this._arrivalMap(instance);
    const satisfied = new Set<string>();
    for (const [tokId, src] of arrivedFrom) {
      const t = instance.tokens.find((x) => x.id === tokId);
      if (t && t.state === TokenState.Waiting && t.nodeId === node.id && t.scopeId === token.scopeId) {
        satisfied.add(src);
      }
    }
    // Include the just-arrived token.
    const mySource = this._arrivalMap(instance).get(token.id);
    if (mySource) satisfied.add(mySource);

    const allArrived = [...inboundSources].every((s) => satisfied.has(s));

    let canFire = false;
    if (kind === 'and') {
      canFire = allArrived;
    } else {
      // OR join: fire when all arrived OR no other token can still reach.
      canFire =
        allArrived ||
        !this._anyTokenCanReachJoin(instance, def, token.scopeId, node.id, token, waitingHere);
    }

    if (!canFire) return;

    // Consume all tokens waiting at this join (including this one), then
    // emit a single token forward.
    const toConsume = instance.tokens.filter(
      (t) =>
        t.state === TokenState.Waiting &&
        t.resumeAt === null &&
        t.nodeId === node.id &&
        t.scopeId === token.scopeId
    );
    for (const t of toConsume) {
      t.state = TokenState.Consumed;
      this._arrivalMap(instance).delete(t.id);
    }
    token.state = TokenState.Active;
    const flows = this._outgoing(def, token.scopeId, node.id);
    if (flows.length === 0) {
      token.state = TokenState.Completed;
      return;
    }
    // Joins emit a single token (converging semantics).
    this._moveTo(instance, token, flows[0]!.targetRef);
  }

  /**
   * Side-channel: token id → the source node it last came from. Needed
   * because a waiting token at a join has already overwritten `nodeId`
   * with the join's id; we record arrivals to know which inbound flows
   * are satisfied.
   */
  private _arrivalMap(instance: ProcessInstance): Map<string, string> {
    const ext = instance as unknown as { __arrivals?: Map<string, string> };
    if (!ext.__arrivals) ext.__arrivals = new Map();
    return ext.__arrivals;
  }

  /**
   * OR-join reachability: can any active/waiting-timer token still reach
   * one of the join's inbound source nodes? BFS over the flow graph from
   * every non-join-waiting token's current position.
   */
  private _anyTokenCanReachJoin(
    instance: ProcessInstance,
    def: ProcessDefinition,
    scopeId: string | null,
    joinId: string,
    _self: Token,
    waitingHere: Token[]
  ): boolean {
    const scope = this._scopeOf(def, scopeId);
    const waitingIds = new Set(waitingHere.map((t) => t.id));
    const inboundSources = new Set(
      scope.flows.filter((f) => f.targetRef === joinId).map((f) => f.sourceRef)
    );

    for (const t of instance.tokens) {
      if (t.scopeId !== scopeId) continue;
      if (t.state === TokenState.Consumed || t.state === TokenState.Completed) continue;
      if (waitingIds.has(t.id)) continue;
      if (t.state === TokenState.Waiting && t.resumeAt === null) continue; // parked at another join
      // BFS from t.nodeId through the scope's flows.
      const visited = new Set<string>();
      const queue = [t.nodeId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (inboundSources.has(cur)) return true;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const f of scope.flows) {
          if (f.sourceRef === cur && !visited.has(f.targetRef)) queue.push(f.targetRef);
        }
      }
    }
    return false;
  }

  // ------------------------------------------------------------------
  // Sub-processes, timers, errors
  // ------------------------------------------------------------------

  private async _enterSubProcess(
    instance: ProcessInstance,
    def: ProcessDefinition,
    token: Token,
    node: ProcessNode
  ): Promise<void> {
    if (!node.children) {
      this._fail(instance, token, `ENGINE-EMPTY-SUBPROCESS:${node.id}`);
      return;
    }
    const childStart = node.children.nodes.find(
      (n) => n.type === NodeType.StartEvent && !n.attachedToRef
    );
    if (!childStart) {
      this._fail(instance, token, `ENGINE-NO-SUBSTART:${node.id}`);
      return;
    }
    // Token moves into the child scope.
    token.scopeId = node.id;
    token.nodeId = childStart.id;
  }

  /**
   * End event: if inside a subprocess, the token exits to the parent's
   * outgoing flow; at top level it completes.
   */
  private _endToken(instance: ProcessInstance, token: Token, _node: ProcessNode): void {
    if (token.scopeId !== null) {
      // Exiting a subprocess — the token returns to parent scope at the
      // subprocess node, then proceeds along its outgoing flow.
      const subNodeId = token.scopeId;
      token.scopeId = null;
      token.nodeId = subNodeId;
      const flows = this._outgoing(this._defOf(instance), null, subNodeId);
      if (flows.length === 0) {
        token.state = TokenState.Completed;
      } else {
        this._moveTo(instance, token, flows[0]!.targetRef);
      }
      return;
    }
    token.state = TokenState.Completed;
  }

  private _defOf(instance: ProcessInstance): ProcessDefinition {
    return this._definitions.get(instance.definitionId)!;
  }

  /**
   * Task error → boundary error event routing.
   *
   * If the failing node has a boundary ErrorEvent attached with a
   * matching error code (or wildcard '*'), the token diverts to the
   * boundary handler's outgoing flow and the activity is interrupted.
   * Otherwise the instance fails.
   */
  private _handleTaskError(
    instance: ProcessInstance,
    def: ProcessDefinition,
    token: Token,
    node: ProcessNode,
    err: unknown
  ): void {
    const code = err instanceof BpmnError ? err.code : 'ERROR';
    const boundary = this._findBoundaryError(def, token.scopeId, node.id, code);
    if (boundary && boundary.cancelActivity !== false) {
      // Interrupt: token jumps to the boundary event and proceeds.
      token.nodeId = boundary.id;
      token.state = TokenState.Active;
      this._trace(instance, boundary.id);
      // The boundary event's outgoing is followed via normal proceed.
      const flows = this._outgoing(def, token.scopeId, boundary.id);
      if (flows.length > 0) {
        this._moveTo(instance, token, flows[0]!.targetRef);
      } else {
        token.state = TokenState.Completed;
      }
      return;
    }
    this._fail(instance, token, code);
  }

  private _findBoundaryError(
    def: ProcessDefinition,
    scopeId: string | null,
    attachedToId: string,
    code: string
  ): ProcessNode | null {
    const scope = this._scopeOf(def, scopeId);
    const candidates = scope.nodes.filter(
      (n) =>
        n.type === NodeType.ErrorEvent &&
        n.attachedToRef === attachedToId &&
        (n.errorCode === code || n.errorCode === '*' || n.errorCode === undefined)
    );
    // Exact code match beats wildcard.
    return (
      candidates.find((n) => n.errorCode === code) ??
      candidates.find((n) => n.errorCode === '*') ??
      candidates[0] ??
      null
    );
  }

  private _fail(instance: ProcessInstance, token: Token, code: string): void {
    token.state = TokenState.Failed;
    instance.state = InstanceState.Failed;
    instance.errorCode = code;
    instance.completedAt = this._clock.now();
    for (const t of instance.tokens) {
      if (t.state === TokenState.Active || t.state === TokenState.Waiting) {
        t.state = TokenState.Failed;
      }
    }
  }

  private _checkCompletion(instance: ProcessInstance): void {
    if (instance.state !== InstanceState.Running) return;
    const live = instance.tokens.some(
      (t) => t.state === TokenState.Active || t.state === TokenState.Waiting
    );
    if (!live) {
      instance.state = InstanceState.Completed;
      instance.completedAt = this._clock.now();
    }
  }

  private _trace(instance: ProcessInstance, nodeId: string): void {
    instance.trace.push(nodeId);
    for (const l of this._listeners) l(instance.id, nodeId);
  }

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  private _validate(def: ProcessDefinition): void {
    const ids = new Set<string>();
    const collect = (d: ProcessDefinition) => {
      for (const n of d.nodes) {
        if (ids.has(n.id)) throw new Error(`Duplicate node id: ${n.id}`);
        ids.add(n.id);
        if (n.children) collect(n.children);
      }
    };
    collect(def);
    const checkFlows = (d: ProcessDefinition) => {
      for (const f of d.flows) {
        if (!d.nodes.some((n) => n.id === f.sourceRef)) {
          throw new Error(`Flow ${f.id}: unknown source ${f.sourceRef}`);
        }
        if (!d.nodes.some((n) => n.id === f.targetRef) && !ids.has(f.targetRef)) {
          throw new Error(`Flow ${f.id}: unknown target ${f.targetRef}`);
        }
      }
      for (const n of d.nodes) if (n.children) checkFlows(n.children);
    };
    checkFlows(def);
  }
}
