/**
 * Ad-Hoc Subprocess Support
 *
 * Dynamic task insertion into a *running* process instance — the BPMN
 * "ad-hoc subprocess" pattern where a case worker decides at runtime
 * which tasks to perform and in what order, rather than following a
 * fully-modelled flow.
 *
 * Mechanism: the registry wraps a {@link BpmnEngine} and keeps, per
 * processId, a mutable "shell" definition containing a marker
 * ad-hoc subprocess node whose `children` definition can be grown at
 * runtime via {@link insertTask}. Inserted tasks are appended to the
 * subprocess's children with a start-event -> task -> end-event
 * fragment, so a token entering the subprocess executes every inserted
 * task in insertion order, then exits.
 *
 * Because instances bind to the definition object at start, mutations
 * apply to all instances that haven't yet ENTERED the ad-hoc node —
 * once a token is inside, further inserts join the tail if the token
 * hasn't completed them yet (append-only: never insert before the
 * current position).
 *
 * @module BpmnLayer/Engine2
 */

import type { BpmnEngine } from '../engines/BpmnEngine';
import {
  NodeType,
  ProcessDefinition,
  ProcessNode,
  SequenceFlow,
} from '../engines/types';
import { IClock, SystemClock } from './types';

let adhocSeq = 0;

export interface AdHocHandle {
  /** The ad-hoc subprocess node id inside the shell definition. */
  subProcessId: string;
  /** The mutable children definition being grown. */
  children: ProcessDefinition;
  /** Number of tasks inserted so far. */
  insertedCount: number;
}

export class AdHocSubprocessRegistry {
  private readonly _engine: BpmnEngine;
  private readonly _clock: IClock;
  /** processId -> handle. */
  private readonly _handles: Map<string, AdHocHandle>;

  constructor(engine: BpmnEngine, clock: IClock = new SystemClock()) {
    this._engine = engine;
    this._clock = clock;
    this._handles = new Map();
  }

  /**
   * Register a process whose ad-hoc region is a single subprocess node.
   * `shell` must contain exactly one SubProcess node with `children`
   * containing ONLY a start event, an end event, and a start->end flow;
   * tasks are inserted between them later.
   */
  registerAdHocProcess(processId: string, shell: ProcessDefinition): AdHocHandle {
    const sub = shell.nodes.find((n) => n.type === NodeType.SubProcess && n.children);
    if (!sub || !sub.children) {
      throw new Error(`Process ${processId} has no ad-hoc subprocess node`);
    }
    const hasStart = sub.children.nodes.some((n) => n.type === NodeType.StartEvent);
    const hasEnd = sub.children.nodes.some((n) => n.type === NodeType.EndEvent);
    if (!hasStart || !hasEnd) {
      throw new Error('Ad-hoc subprocess children must contain a start and an end event');
    }
    this._engine.deploy(shell);
    const handle: AdHocHandle = {
      subProcessId: sub.id,
      children: sub.children,
      insertedCount: 0,
    };
    this._handles.set(processId, handle);
    return handle;
  }

  /**
   * Insert `taskId` at the END of the ad-hoc region's task chain.
   * Creates `prev -> task -> endEvent` wiring; the previous tail's
   * end-bound flow is rerouted through the new task.
   */
  insertTask(processId: string, taskId: string): ProcessNode {
    const h = this._handles.get(processId);
    if (!h) throw new Error(`No ad-hoc process registered: ${processId}`);
    const end = h.children.nodes.find((n) => n.type === NodeType.EndEvent)!;
    const start = h.children.nodes.find((n) => n.type === NodeType.StartEvent)!;

    const taskNode: ProcessNode = { id: taskId, type: NodeType.Task, name: taskId };
    adhocSeq += 1;
    const seq = adhocSeq;

    if (h.insertedCount === 0) {
      // First task: start -> task -> end.
      h.children.flows = h.children.flows.filter((f) => f.targetRef !== end.id);
      h.children.flows.push(
        { id: `ah-${seq}-in`, sourceRef: start.id, targetRef: taskId, condition: null, isDefault: false },
        { id: `ah-${seq}-out`, sourceRef: taskId, targetRef: end.id, condition: null, isDefault: false }
      );
    } else {
      // Find the task currently feeding `end` and splice the new task
      // between it and the end event.
      const lastToEnd = h.children.flows.find((f) => f.targetRef === end.id)!;
      const prevTail = lastToEnd.sourceRef;
      h.children.flows = h.children.flows.filter((f) => f !== lastToEnd);
      h.children.flows.push(
        { id: `ah-${seq}-mid`, sourceRef: prevTail, targetRef: taskId, condition: null, isDefault: false },
        { id: `ah-${seq}-out`, sourceRef: taskId, targetRef: end.id, condition: null, isDefault: false }
      );
    }
    h.children.nodes.push(taskNode);
    h.insertedCount += 1;
    return taskNode;
  }

  /**
   * Insert `taskId` immediately AFTER `afterTaskId` — used when a case
   * worker injects a follow-up step in the middle of a running ad-hoc
   * region. Only valid when the token hasn't passed `afterTaskId` yet;
   * we can't rewind a token that's already moved on.
   */
  insertAfter(processId: string, afterTaskId: string, taskId: string): ProcessNode {
    const h = this._handles.get(processId);
    if (!h) throw new Error(`No ad-hoc process registered: ${processId}`);
    const outflow = h.children.flows.find((f) => f.sourceRef === afterTaskId);
    if (!outflow) throw new Error(`Task ${afterTaskId} has no outgoing flow`);
    const next = outflow.targetRef;
    const taskNode: ProcessNode = { id: taskId, type: NodeType.Task, name: taskId };
    adhocSeq += 1;
    const seq = adhocSeq;
    h.children.flows = h.children.flows.filter((f) => f !== outflow);
    h.children.flows.push(
      { id: `ah-${seq}-a`, sourceRef: afterTaskId, targetRef: taskId, condition: null, isDefault: false },
      { id: `ah-${seq}-b`, sourceRef: taskId, targetRef: next, condition: null, isDefault: false }
    );
    h.children.nodes.push(taskNode);
    h.insertedCount += 1;
    return taskNode;
  }

  handleFor(processId: string): AdHocHandle | null {
    return this._handles.get(processId) ?? null;
  }

  /**
   * Build a minimal ad-hoc shell: start -> adhoc-subprocess -> end,
   * with the subprocess children = {start -> end}.
   */
  static shell(processId: string, adHocNodeId = 'adhoc'): ProcessDefinition {
    return {
      id: processId,
      name: processId,
      nodes: [
        { id: 'start', type: NodeType.StartEvent, name: 'start' },
        {
          id: adHocNodeId,
          type: NodeType.SubProcess,
          name: adHocNodeId,
          children: {
            id: `${processId}/${adHocNodeId}`,
            name: 'ad-hoc',
            nodes: [
              { id: 'ah-start', type: NodeType.StartEvent, name: 'ah-start' },
              { id: 'ah-end', type: NodeType.EndEvent, name: 'ah-end' },
            ],
            flows: [
              { id: 'ah-f', sourceRef: 'ah-start', targetRef: 'ah-end', condition: null, isDefault: false },
            ],
          },
        },
        { id: 'end', type: NodeType.EndEvent, name: 'end' },
      ],
      flows: [
        { id: 's1', sourceRef: 'start', targetRef: adHocNodeId, condition: null, isDefault: false },
        { id: 's2', sourceRef: adHocNodeId, targetRef: 'end', condition: null, isDefault: false },
      ],
    };
  }
}
