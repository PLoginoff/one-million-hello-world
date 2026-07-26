/**
 * DistributedTracingExecution Entity
 *
 * Tracks a single distributed-tracing execution.
 */

export interface DistributedTracingExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DistributedTracingExecution {
  readonly data: DistributedTracingExecutionData;

  private constructor(data: DistributedTracingExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DistributedTracingExecution {
    const now = Date.now();
    return new DistributedTracingExecution({
      id: 'distributed-tracing-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DistributedTracingExecution {
    return new DistributedTracingExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DistributedTracingExecution {
    return new DistributedTracingExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DistributedTracingExecution {
    return new DistributedTracingExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DistributedTracingExecution {
    if (this.data.tags.includes(tag)) return this;
    return new DistributedTracingExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DistributedTracingExecution {
    return new DistributedTracingExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DistributedTracingExecution {
    return new DistributedTracingExecution({
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

  toObject(): DistributedTracingExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
