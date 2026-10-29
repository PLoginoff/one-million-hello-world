/**
 * Workflow definition model — a BPMN-lite process graph.
 *
 * A {@link WorkflowDefinition} is a directed graph of {@link FlowNode}s:
 *
 *  - `task` — unit of work with optional retries, deadline (escalation)
 *    and a `compensation` handler run during rollback (saga semantics).
 *  - `xor` — exclusive gateway; evaluates outgoing edge conditions in
 *    declaration order, takes the first whose condition holds (the edge
 *    marked `default` is the fallback).
 *  - `and` — parallel gateway; when outgoing, forks into ALL outgoing
 *    branches; when incoming with multiple in-edges, joins — the node
 *    completes only when every incoming token arrives.
 *  - `start` / `end` — single entry, possibly several exits.
 *  - `subflow` — inlines another registered workflow version, mapping a
 *    slice of variables in and its result back.
 *
 * Edges: `{ from, to, condition?, default? }`. A condition is a predicate
 * over process variables. Looping is expressed naturally: an edge may point
 * back to an earlier node; a per-node visit bound prevents runaway loops.
 *
 * Execution state (explicit, serializable): each active branch holds a
 * token at a node id; the instance also stores variables, completed task
 * outputs, compensation stack, timers, status and version pinned at start.
 *
 * @module WorkflowEngine/Domain
 */

/** Serializable process variable bag. */
export type WorkflowVariables = Record<string, unknown>;

/** Predicate over process variables — used for XOR edges and loop guards. */
export type EdgeCondition = (vars: WorkflowVariables) => boolean;

export interface FlowEdge {
  readonly from: string;
  readonly to: string;
  readonly condition?: EdgeCondition;
  /** Fallback edge for XOR — taken when no conditioned edge matches. */
  readonly isDefault?: boolean;
}

/* ------------------------------------------------------------------ */
/* Task execution contract                                             */
/* ------------------------------------------------------------------ */

export interface TaskContext {
  /** Current process variables (mutable — writes merge back). */
  readonly variables: WorkflowVariables;
  /** Task input = configured `input` mapping applied to variables. */
  readonly input: Record<string, unknown>;
  readonly instanceId: string;
  readonly nodeId: string;
  /** Attempt number (1-based) for retries. */
  readonly attempt: number;
  readonly signal?: AbortSignal;
}

/** Task handler — the unit of work. */
export type TaskHandler = (ctx: TaskContext) => Promise<unknown> | unknown;

/** Compensation (undo) handler — invoked during rollback, LIFO. */
export type CompensationHandler = (ctx: TaskContext, output: unknown) => Promise<void> | void;

/** Retry policy for a task. */
export interface RetryPolicy {
  readonly maxAttempts: number;
  /** Backoff between attempts, ms. `fixed` constant, `exponential` doubles. */
  readonly backoffMs: number;
  readonly strategy?: 'fixed' | 'exponential';
  /** Predicate — retry only when it returns true for the thrown error. */
  readonly retryableIf?: (error: unknown) => boolean;
}

/** Deadline attached to a task — fires the escalation when exceeded. */
export interface DeadlinePolicy {
  /** Milliseconds after task start. */
  readonly afterMs: number;
  /**
   * What happens on expiry:
   *  - `'fail'` — the task fails (then normal retry/compensation applies).
   *  - `'escalate'` — the escalation handler runs; task is considered
   *    completed with its output (e.g. route to a manager queue).
   *  - `'skip'` — task is skipped (treated as completed with `undefined`).
   */
  readonly action: 'fail' | 'escalate' | 'skip';
  /** For `escalate`: produces the task output instead of the handler. */
  readonly escalateTo?: TaskHandler;
}

/* ------------------------------------------------------------------ */
/* Nodes                                                               */
/* ------------------------------------------------------------------ */

export interface TaskNode {
  readonly kind: 'task';
  readonly id: string;
  readonly name?: string;
  readonly handler: TaskHandler;
  /** Maps variables → task input. Default: all variables. */
  readonly input?: (vars: WorkflowVariables) => Record<string, unknown>;
  /** Maps task output → variable updates. Default: `{ [id]: output }`. */
  readonly output?: (output: unknown, vars: WorkflowVariables) => WorkflowVariables;
  readonly retry?: RetryPolicy;
  readonly deadline?: DeadlinePolicy;
  readonly compensation?: CompensationHandler;
  /** Loop guard — the node repeats while this holds after each execution. */
  readonly loopWhile?: EdgeCondition;
  /** Max loop iterations (safety). Default 100. */
  readonly maxLoopIterations?: number;
}

export interface StartNode {
  readonly kind: 'start';
  readonly id: string;
}

export interface EndNode {
  readonly kind: 'end';
  readonly id: string;
  /** Maps variables → the instance's final output. */
  readonly output?: (vars: WorkflowVariables) => unknown;
}

export interface XorGatewayNode {
  readonly kind: 'xor';
  readonly id: string;
}

export interface AndGatewayNode {
  readonly kind: 'and';
  readonly id: string;
}

export interface SubflowNode {
  readonly kind: 'subflow';
  readonly id: string;
  /** Workflow definition id to invoke — pinned at *start* of this node. */
  readonly workflowId: string;
  /** Version pin — if omitted, latest at execution time. */
  readonly version?: string;
  /** Variables → child input mapping. */
  readonly input?: (vars: WorkflowVariables) => WorkflowVariables;
  /** Child output → variable updates. */
  readonly output?: (output: unknown, vars: WorkflowVariables) => WorkflowVariables;
  readonly retry?: RetryPolicy;
  readonly compensation?: CompensationHandler;
}

export type FlowNode = TaskNode | StartNode | EndNode | XorGatewayNode | AndGatewayNode | SubflowNode;

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export interface WorkflowDefinition {
  readonly id: string;
  readonly version: string;
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
  /** Optional instance-level deadline — whole run must finish within ms. */
  readonly timeoutMs?: number;
  readonly description?: string;
}

/** Validates graph shape — returns a list of problems (empty = valid). */
export function validateDefinition(def: WorkflowDefinition): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  let starts = 0;
  for (const n of def.nodes) {
    if (ids.has(n.id)) {
      problems.push(`duplicate node id: ${n.id}`);
    }
    ids.add(n.id);
    if (n.kind === 'start') {
      starts++;
    }
    if (n.kind === 'subflow' && n.workflowId === def.id) {
      problems.push(`subflow ${n.id} references its own workflow ${def.id}`);
    }
  }
  if (starts === 0) {
    problems.push('no start node');
  }
  if (starts > 1) {
    problems.push('multiple start nodes');
  }
  for (const e of def.edges) {
    if (!ids.has(e.from)) {
      problems.push(`edge from unknown node ${e.from}`);
    }
    if (!ids.has(e.to)) {
      problems.push(`edge to unknown node ${e.to}`);
    }
  }
  // XOR nodes should have ≥2 outgoing edges and at most one default.
  for (const n of def.nodes) {
    if (n.kind === 'xor') {
      const out = def.edges.filter((e) => e.from === n.id);
      if (out.length < 2) {
        problems.push(`xor ${n.id} has ${out.length} outgoing edges (need ≥2)`);
      }
      if (out.filter((e) => e.isDefault).length > 1) {
        problems.push(`xor ${n.id} has multiple default edges`);
      }
    }
  }
  // Unreachable nodes (other than start).
  const reachable = new Set<string>();
  const queue = def.nodes.filter((n) => n.kind === 'start').map((n) => n.id);
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (reachable.has(id)) {
      continue;
    }
    reachable.add(id);
    for (const e of def.edges) {
      if (e.from === id) {
        queue.push(e.to);
      }
    }
  }
  for (const n of def.nodes) {
    if (!reachable.has(n.id)) {
      problems.push(`unreachable node ${n.id}`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* Instance state (serializable)                                       */
/* ------------------------------------------------------------------ */

export type InstanceStatus =
  | 'running'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'compensated'
  | 'terminated';

/** One live token — a point of control in the graph. */
export interface Token {
  readonly id: string;
  /** Node the token is currently AT (about to execute or waiting to join). */
  nodeId: string;
  /** For AND-joins: how many in-edges must arrive before proceeding. */
  readonly joinExpectation?: number;
  /** Sibling tokens merged into this join arrive here. */
  readonly joinArrivals?: number;
}

export interface TaskRecord {
  readonly nodeId: string;
  readonly startedAt: number;
  completedAt?: number;
  attempts: number;
  output?: unknown;
  error?: string;
  timedOut?: boolean;
  escalated?: boolean;
  skipped?: boolean;
  loopIterations?: number;
}

/** A completed task that can be compensated, with the data needed to undo. */
export interface CompensationEntry {
  readonly nodeId: string;
  readonly output: unknown;
  readonly variablesSnapshot: WorkflowVariables;
}

export interface WorkflowInstanceState {
  readonly instanceId: string;
  readonly workflowId: string;
  /** Definition version pinned at start — upgrades don't touch in-flight. */
  readonly version: string;
  status: InstanceStatus;
  variables: WorkflowVariables;
  tokens: Token[];
  history: TaskRecord[];
  compensationStack: CompensationEntry[];
  readonly startedAt: number;
  completedAt?: number;
  output?: unknown;
  error?: string;
  /** Pending timer fires: nodeId → deadline timestamp. */
  timers: Record<string, number>;
  /** Subflow invocations for traceability. */
  subflowRuns: { nodeId: string; childInstanceId: string; workflowId: string }[];
}

export type WorkflowEvent =
  | { type: 'instance-started'; instanceId: string; workflowId: string }
  | { type: 'task-started'; instanceId: string; nodeId: string; attempt: number }
  | { type: 'task-completed'; instanceId: string; nodeId: string; output: unknown }
  | { type: 'task-failed'; instanceId: string; nodeId: string; error: string; willRetry: boolean }
  | { type: 'task-escalated'; instanceId: string; nodeId: string }
  | { type: 'task-compensated'; instanceId: string; nodeId: string }
  | { type: 'token-moved'; instanceId: string; tokenId: string; nodeId: string }
  | { type: 'forked'; instanceId: string; gatewayId: string; branches: number }
  | { type: 'joined'; instanceId: string; gatewayId: string }
  | { type: 'instance-suspended'; instanceId: string }
  | { type: 'instance-resumed'; instanceId: string }
  | { type: 'instance-completed'; instanceId: string; output: unknown }
  | { type: 'instance-failed'; instanceId: string; error: string }
  | { type: 'instance-compensated'; instanceId: string }
  | { type: 'instance-terminated'; instanceId: string; reason: string };

export type WorkflowEventListener = (event: WorkflowEvent) => void;
