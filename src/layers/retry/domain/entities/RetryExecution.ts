/**
 * RetryExecution Entity
 *
 * Tracks a single retry execution.
 */

export interface RetryExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RetryExecution {
  readonly data: RetryExecutionData;

  private constructor(data: RetryExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RetryExecution {
    const now = Date.now();
    return new RetryExecution({
      id: 'retry-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RetryExecution {
    return new RetryExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RetryExecution {
    return new RetryExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RetryExecution {
    return new RetryExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RetryExecution {
    if (this.data.tags.includes(tag)) return this;
    return new RetryExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RetryExecution {
    return new RetryExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RetryExecution {
    return new RetryExecution({
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

  toObject(): RetryExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
