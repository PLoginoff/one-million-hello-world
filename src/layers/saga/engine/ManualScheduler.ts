/**
 * ManualScheduler — test-friendly `SagaScheduler` + clock.
 *
 * Real `setTimeout` makes timeout/backoff tests nondeterministic and slow.
 * This scheduler queues (dueAt, fn) on a virtual clock: `advance(ms)`
 * fires everything due, in order — the same pattern as Node's
 * `@sinonjs/fake-timers` but dependency-free.
 *
 * The production `SystemScheduler` wraps real `setTimeout`/`clearTimeout`.
 *
 * @module SagaLayer/Engine
 */

import { SagaClock, SagaScheduler } from './types';

interface Task {
  readonly dueAt: number;
  readonly id: number;
  fn: () => void;
  cancelled: boolean;
}

export class ManualScheduler implements SagaScheduler, SagaClock {
  private t = 0;
  private tasks: Task[] = [];
  private nextId = 0;

  now(): number {
    return this.t;
  }

  /** Advances virtual time, firing due tasks in due order (stable). */
  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      const next = this.tasks.filter((x) => !x.cancelled && x.dueAt <= target)
        .sort((a, b) => a.dueAt - b.dueAt || a.id - b.id)[0];
      if (!next) break;
      this.t = next.dueAt; // tasks see the time they were due, not target
      next.cancelled = true;
      next.fn();
      this.tasks = this.tasks.filter((x) => !x.cancelled);
    }
    this.t = target;
  }

  setTimeout(fn: () => void, ms: number): () => void {
    const task: Task = { dueAt: this.t + ms, id: this.nextId++, fn, cancelled: false };
    this.tasks.push(task);
    return () => {
      task.cancelled = true;
    };
  }

  get pending(): number {
    return this.tasks.filter((t) => !t.cancelled).length;
  }
}

/** Wall-clock scheduler — the production implementation. */
export class SystemScheduler implements SagaScheduler, SagaClock {
  now(): number {
    return Date.now();
  }

  setTimeout(fn: () => void, ms: number): () => void {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  }
}
