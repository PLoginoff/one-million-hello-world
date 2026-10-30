/**
 * Workflow Engine — Human Task Support
 *
 * In-memory human-task inbox for steps that need a person: assignment,
 * delegation, escalation, completion.
 *
 * Task lifecycle:
 *
 *   open ──claim──> claimed ──complete──> completed
 *      │               │
 *      │            delegate ──> claimed (assignee swapped, audit kept)
 *      │               │
 *      └──escalate──> escalated ──reassign/claim──> claimed
 *                         │
 *                      cancel ──> cancelled
 *
 *  - `createTask` — opens a task bound to (instanceId, nodeId). Optional
 *    `candidateGroups`/`assignee`, `priority`, `dueAt` (for escalation).
 *  - `claim` — pull a task from a group into a user's inbox.
 *  - `complete` — close with output + actor; records completedAt for
 *    duration metrics.
 *  - `delegate` — hand a claimed task to another user (adds an audit
 *    entry; task stays claimed under the new assignee).
 *  - `escalate` — bump to a manager group/user when overdue or on demand;
 *    increments escalationCount and records why.
 *  - `tick()` — scans open tasks past `dueAt` and auto-escalates to
 *    `defaultEscalationTarget` if configured.
 *  - `inbox(userId)` / `groupQueue(group)` — the standard task-list views.
 *  - Full audit trail per task (created/claimed/delegated/escalated/
 *    completed) — `audit(taskId)`.
 *
 * No timers — the injectable clock + `tick()` drive due-date checks so
 * tests advance time manually.
 *
 * @module WorkflowEngine/Engine2
 */

export class HumanTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HumanTaskError';
  }
}

export type TaskStatus = 'open' | 'claimed' | 'escalated' | 'completed' | 'cancelled';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface HumanTask {
  readonly taskId: string;
  readonly instanceId: string;
  readonly nodeId: string;
  readonly title: string;
  readonly description?: string;
  priority: TaskPriority; // mutable — escalation bumps it to 'urgent'
  status: TaskStatus;
  assignee?: string;
  candidateGroups: string[];
  readonly createdAt: number;
  claimedAt?: number;
  dueAt?: number;
  completedAt?: number;
  completedBy?: string;
  output?: unknown;
  escalationCount: number;
  /** User/group the task was escalated TO (most recent). */
  escalatedTo?: string;
}

export interface TaskAuditEntry {
  readonly at: number;
  readonly event:
    | 'created'
    | 'claimed'
    | 'released'
    | 'delegated'
    | 'escalated'
    | 'completed'
    | 'cancelled'
    | 'reassigned';
  readonly actor?: string;
  readonly detail: string;
}

export interface HumanTaskServiceOptions {
  clock?: () => number;
  /** When a task passes dueAt, escalate to this user/group via tick(). */
  defaultEscalationTarget?: string;
}

let taskCounter = 0;

export class HumanTaskService {
  private readonly _clock: () => number;
  private readonly _defaultEscalationTarget?: string;
  private readonly _tasks = new Map<string, HumanTask>();
  private readonly _audit = new Map<string, TaskAuditEntry[]>();

  constructor(options: HumanTaskServiceOptions = {}) {
    this._clock = options.clock ?? Date.now;
    this._defaultEscalationTarget = options.defaultEscalationTarget;
  }

  /** Open a new human task. */
  createTask(input: {
    instanceId: string;
    nodeId: string;
    title: string;
    description?: string;
    assignee?: string;
    candidateGroups?: string[];
    priority?: TaskPriority;
    /** ms-from-now deadline — drives auto-escalation on tick(). */
    dueInMs?: number;
  }): HumanTask {
    const now = this._clock();
    const task: HumanTask = {
      taskId: `ht-${++taskCounter}`,
      instanceId: input.instanceId,
      nodeId: input.nodeId,
      title: input.title,
      description: input.description,
      priority: input.priority ?? 'normal',
      status: 'open',
      assignee: input.assignee,
      candidateGroups: [...(input.candidateGroups ?? [])],
      createdAt: now,
      dueAt: input.dueInMs !== undefined ? now + input.dueInMs : undefined,
      escalationCount: 0,
    };
    this._tasks.set(task.taskId, task);
    this._log(task.taskId, 'created', input.assignee, `task '${input.title}' opened`);
    if (input.assignee) {
      task.status = 'claimed';
      task.claimedAt = now;
      this._log(task.taskId, 'claimed', input.assignee, 'auto-assigned at creation');
    }
    return task;
  }

  get(taskId: string): HumanTask | undefined {
    return this._tasks.get(taskId);
  }

  /** Claim an open (or escalated) task into `userId`'s inbox. */
  claim(taskId: string, userId: string): HumanTask {
    const t = this._mustGet(taskId);
    if (t.status === 'completed' || t.status === 'cancelled') {
      throw new HumanTaskError(`cannot claim ${taskId}: status ${t.status}`);
    }
    t.status = 'claimed';
    t.assignee = userId;
    t.claimedAt = this._clock();
    this._log(taskId, 'claimed', userId, `claimed by ${userId}`);
    return t;
  }

  /** Release a claimed task back to its group queue. */
  release(taskId: string, actor: string): HumanTask {
    const t = this._mustGet(taskId);
    if (t.status !== 'claimed' && t.status !== 'escalated') {
      throw new HumanTaskError(`cannot release ${taskId}: status ${t.status}`);
    }
    t.status = 'open';
    const prev = t.assignee;
    t.assignee = undefined;
    this._log(taskId, 'released', actor, `released by ${prev ?? actor}`);
    return t;
  }

  /**
   * Delegate a claimed task to another user. Task stays claimed under the
   * new assignee; the handoff is audited.
   */
  delegate(taskId: string, from: string, to: string, reason = ''): HumanTask {
    const t = this._mustGet(taskId);
    if (t.status !== 'claimed' && t.status !== 'escalated') {
      throw new HumanTaskError(`cannot delegate ${taskId}: status ${t.status}`);
    }
    if (t.assignee !== from) {
      throw new HumanTaskError(`cannot delegate ${taskId}: assigned to ${t.assignee ?? 'nobody'}, not ${from}`);
    }
    t.assignee = to;
    this._log(taskId, 'delegated', from, `delegated ${from} → ${to}${reason ? `: ${reason}` : ''}`);
    return t;
  }

  /**
   * Escalate a task — bumps priority to 'urgent' by default, moves to an
   * escalation target (user or group), and counts the escalation.
   */
  escalate(taskId: string, target: string, reason = ''): HumanTask {
    const t = this._mustGet(taskId);
    if (t.status === 'completed' || t.status === 'cancelled') {
      throw new HumanTaskError(`cannot escalate ${taskId}: status ${t.status}`);
    }
    t.status = 'escalated';
    t.escalationCount++;
    t.escalatedTo = target;
    if (t.priority === 'low' || t.priority === 'normal') {
      t.priority = 'urgent';
    }
    // If the target looks like a user (no spaces-free convention here —
    // callers decide), we still set it as assignee so it lands in an inbox.
    t.assignee = target;
    this._log(taskId, 'escalated', undefined, `escalated to ${target}${reason ? `: ${reason}` : ''}`);
    return t;
  }

  /** Complete a task with output. Only the current assignee may complete. */
  complete(taskId: string, actor: string, output?: unknown): HumanTask {
    const t = this._mustGet(taskId);
    if (t.status === 'completed' || t.status === 'cancelled') {
      throw new HumanTaskError(`cannot complete ${taskId}: status ${t.status}`);
    }
    if (t.assignee && t.assignee !== actor) {
      throw new HumanTaskError(`cannot complete ${taskId}: assigned to ${t.assignee}, not ${actor}`);
    }
    t.status = 'completed';
    t.completedAt = this._clock();
    t.completedBy = actor;
    t.output = output;
    this._log(taskId, 'completed', actor, 'task completed');
    return t;
  }

  cancel(taskId: string, reason = ''): HumanTask {
    const t = this._mustGet(taskId);
    if (t.status === 'completed') {
      throw new HumanTaskError(`cannot cancel ${taskId}: already completed`);
    }
    t.status = 'cancelled';
    this._log(taskId, 'cancelled', undefined, reason || 'task cancelled');
    return t;
  }

  /**
   * Auto-escalation pass: any non-terminal task past its `dueAt` is
   * escalated to the configured default target. Returns the escalated
   * task ids. Call periodically; deterministic under a manual clock.
   */
  tick(): ReadonlyArray<string> {
    const now = this._clock();
    const escalated: string[] = [];
    for (const t of this._tasks.values()) {
      if (
        (t.status === 'open' || t.status === 'claimed') &&
        t.dueAt !== undefined &&
        now >= t.dueAt
      ) {
        const target = this._defaultEscalationTarget ?? t.escalatedTo;
        if (target) {
          this.escalate(t.taskId, target, 'past due date');
          escalated.push(t.taskId);
        }
      }
    }
    return escalated;
  }

  /** Tasks claimed by (or escalated to) a user, most recent first. */
  inbox(userId: string): ReadonlyArray<HumanTask> {
    return [...this._tasks.values()]
      .filter((t) => t.assignee === userId && t.status !== 'completed' && t.status !== 'cancelled')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Unclaimed tasks available to a candidate group. */
  groupQueue(group: string): ReadonlyArray<HumanTask> {
    return [...this._tasks.values()]
      .filter(
        (t) =>
          t.status === 'open' &&
          !t.assignee &&
          t.candidateGroups.includes(group)
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Tasks for a workflow instance (all statuses). */
  tasksForInstance(instanceId: string): ReadonlyArray<HumanTask> {
    return [...this._tasks.values()].filter((t) => t.instanceId === instanceId);
  }

  /** Overdue, non-terminal tasks. */
  overdue(): ReadonlyArray<HumanTask> {
    const now = this._clock();
    return [...this._tasks.values()].filter(
      (t) =>
        t.dueAt !== undefined &&
        now >= t.dueAt &&
        t.status !== 'completed' &&
        t.status !== 'cancelled'
    );
  }

  /** Audit trail for one task. */
  audit(taskId: string): ReadonlyArray<TaskAuditEntry> {
    return this._audit.get(taskId) ?? [];
  }

  /** Mean cycle time (createdAt → completedAt) across completed tasks. */
  meanCycleTimeMs(): number {
    const done = [...this._tasks.values()].filter(
      (t) => t.status === 'completed' && t.completedAt !== undefined
    );
    if (done.length === 0) return 0;
    const total = done.reduce((a, t) => a + (t.completedAt! - t.createdAt), 0);
    return total / done.length;
  }

  private _mustGet(taskId: string): HumanTask {
    const t = this._tasks.get(taskId);
    if (!t) throw new HumanTaskError(`unknown task '${taskId}'`);
    return t;
  }

  private _log(taskId: string, event: TaskAuditEntry['event'], actor: string | undefined, detail: string): void {
    let list = this._audit.get(taskId);
    if (!list) {
      list = [];
      this._audit.set(taskId, list);
    }
    list.push({ at: this._clock(), event, actor, detail });
  }
}
