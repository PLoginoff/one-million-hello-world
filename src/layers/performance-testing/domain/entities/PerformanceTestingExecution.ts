/**
 * PerformanceTestingExecution Entity
 *
 * Tracks a single performance-testing execution.
 */

export interface PerformanceTestingExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class PerformanceTestingExecution {
  readonly data: PerformanceTestingExecutionData;

  private constructor(data: PerformanceTestingExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): PerformanceTestingExecution {
    const now = Date.now();
    return new PerformanceTestingExecution({
      id: 'performance-testing-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): PerformanceTestingExecution {
    return new PerformanceTestingExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): PerformanceTestingExecution {
    return new PerformanceTestingExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): PerformanceTestingExecution {
    return new PerformanceTestingExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): PerformanceTestingExecution {
    if (this.data.tags.includes(tag)) return this;
    return new PerformanceTestingExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): PerformanceTestingExecution {
    return new PerformanceTestingExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): PerformanceTestingExecution {
    return new PerformanceTestingExecution({
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

  toObject(): PerformanceTestingExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
