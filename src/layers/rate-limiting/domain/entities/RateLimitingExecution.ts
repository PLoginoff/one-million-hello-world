/**
 * RateLimitingExecution Entity
 *
 * Tracks a single rate-limiting execution.
 */

export interface RateLimitingExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RateLimitingExecution {
  readonly data: RateLimitingExecutionData;

  private constructor(data: RateLimitingExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RateLimitingExecution {
    const now = Date.now();
    return new RateLimitingExecution({
      id: 'rate-limiting-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RateLimitingExecution {
    return new RateLimitingExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RateLimitingExecution {
    return new RateLimitingExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RateLimitingExecution {
    return new RateLimitingExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RateLimitingExecution {
    if (this.data.tags.includes(tag)) return this;
    return new RateLimitingExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RateLimitingExecution {
    return new RateLimitingExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RateLimitingExecution {
    return new RateLimitingExecution({
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

  toObject(): RateLimitingExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
