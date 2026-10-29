/**
 * BPMN Engine Types
 *
 * Process-definition model and runtime types for a token-based BPMN
 * execution engine supporting: start/end events, user/service tasks,
 * exclusive (XOR), parallel (AND) and inclusive (OR) gateways,
 * subprocesses, timer events, and boundary error events.
 *
 * Execution model follows the BPMN 2.0 spec informally:
 *  - Tokens flow along sequence flows.
 *  - A parallel join consumes one token per inbound flow before firing.
 *  - An inclusive join waits until every inbound flow that WILL still
 *    carry a token has produced one (or is known to never produce one).
 *  - An exclusive gateway picks exactly one outgoing flow by condition.
 *  - Timer events suspend tokens until a duration elapses (clock-injected).
 *
 * @module BpmnLayer/Engines
 */

/** Injectable clock for timers and persistence timestamps. */
export interface IClock {
  now(): number;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

export class TestClock implements IClock {
  private _current: number;
  constructor(start: number = 0) {
    this._current = start;
  }
  now(): number {
    return this._current;
  }
  advance(ms: number): void {
    this._current += ms;
  }
  set(ms: number): void {
    this._current = ms;
  }
}

// ---------------------------------------------------------------------------
// Process definition (static model)
// ---------------------------------------------------------------------------

export enum NodeType {
  StartEvent = 'start-event',
  EndEvent = 'end-event',
  Task = 'task',
  ExclusiveGateway = 'exclusive-gateway',
  ParallelGateway = 'parallel-gateway',
  InclusiveGateway = 'inclusive-gateway',
  SubProcess = 'sub-process',
  TimerEvent = 'timer-event',
  ErrorEvent = 'error-event',
}

export interface SequenceFlow {
  id: string;
  sourceRef: string;
  targetRef: string;
  /**
   * Condition expression evaluated against process variables — only on
   * flows leaving exclusive/inclusive gateways. Syntax: `varName`,
   * `varName == literal`, `varName != literal`, `varName > n`,
   * `varName < n`, `varName >= n`, `varName <= n`. Unconditional = always.
   */
  condition: string | null;
  /** Default flow of a gateway — taken when no condition matches (XOR/OR). */
  isDefault: boolean;
}

export interface ProcessNode {
  id: string;
  type: NodeType;
  name: string;
  /** For subprocess nodes: nested flow elements. */
  children?: ProcessDefinition;
  /** For timer events: duration in ms before the token proceeds. */
  timerDurationMs?: number;
  /** For error events: the error code thrown/caught. */
  errorCode?: string;
  /**
   * Boundary event attachment: when set on an ErrorEvent/TimerEvent
   * node, the node interrupts `attachedToRef` on trigger.
   */
  attachedToRef?: string;
  /** Whether a boundary event interrupts the activity it is bound to. */
  cancelActivity?: boolean;
}

export interface ProcessDefinition {
  id: string;
  name: string;
  nodes: ProcessNode[];
  flows: SequenceFlow[];
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export enum TokenState {
  Active = 'active',
  /** Waiting at a join, timer, or async task. */
  Waiting = 'waiting',
  /** Consumed by a join or terminated by an event. */
  Consumed = 'consumed',
  /** Reached an end event. */
  Completed = 'completed',
  /** Caught by a boundary error event. */
  Failed = 'failed',
}

export interface Token {
  id: string;
  /** The node the token currently sits at. */
  nodeId: string;
  /** The scope (subprocess node id) the token executes in; null = top level. */
  scopeId: string | null;
  /** For tokens spawned by a parallel split: siblings share a parent. */
  parentTokenId: string | null;
  state: TokenState;
  /** For timer waits: the epoch ms when the token may proceed. */
  resumeAt: number | null;
}

export enum InstanceState {
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
}

export interface ProcessInstance {
  id: string;
  definitionId: string;
  state: InstanceState;
  /** Variables visible to condition evaluation and task handlers. */
  variables: Map<string, unknown>;
  tokens: Token[];
  /** Node ids visited, in order — the execution trace. */
  trace: string[];
  startedAt: number;
  completedAt: number | null;
  /** Error code when state = Failed. */
  errorCode: string | null;
}

/** Task handler invoked when a token reaches a Task node. */
export type TaskHandler = (
  taskId: string,
  variables: Map<string, unknown>
) => void | Promise<void>;

/** Records every node entry for observability. */
export type TraceListener = (instanceId: string, nodeId: string) => void;
