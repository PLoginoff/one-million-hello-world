/**
 * MiddlewareExecution Entity
 *
 * Tracks a single middleware execution.
 */

export interface MiddlewareExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MiddlewareExecution {
  readonly data: MiddlewareExecutionData;

  private constructor(data: MiddlewareExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MiddlewareExecution {
    const now = Date.now();
    return new MiddlewareExecution({
      id: 'middleware-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MiddlewareExecution {
    return new MiddlewareExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MiddlewareExecution {
    return new MiddlewareExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MiddlewareExecution {
    return new MiddlewareExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MiddlewareExecution {
    if (this.data.tags.includes(tag)) return this;
    return new MiddlewareExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MiddlewareExecution {
    return new MiddlewareExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MiddlewareExecution {
    return new MiddlewareExecution({
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

  toObject(): MiddlewareExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
