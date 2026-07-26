/**
 * SchedulingExecution Entity
 *
 * Tracks a single scheduling execution.
 */

export interface SchedulingExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SchedulingExecution {
  readonly data: SchedulingExecutionData;

  private constructor(data: SchedulingExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SchedulingExecution {
    const now = Date.now();
    return new SchedulingExecution({
      id: 'scheduling-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SchedulingExecution {
    return new SchedulingExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SchedulingExecution {
    return new SchedulingExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SchedulingExecution {
    return new SchedulingExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SchedulingExecution {
    if (this.data.tags.includes(tag)) return this;
    return new SchedulingExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SchedulingExecution {
    return new SchedulingExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SchedulingExecution {
    return new SchedulingExecution({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  isPending(): boolean {
    return this.data.status === 'pending';
  }
  isActive(): boolean {
    return this.data.status === 'active';
  }
  isCompleted(): boolean {
    return this.data.status === 'completed';
  }
  isFailed(): boolean {
    return this.data.status === 'failed';
  }

  toObject(): SchedulingExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
