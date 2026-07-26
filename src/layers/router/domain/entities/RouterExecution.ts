/**
 * RouterExecution Entity
 *
 * Tracks a single router execution.
 */

export interface RouterExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RouterExecution {
  readonly data: RouterExecutionData;

  private constructor(data: RouterExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RouterExecution {
    const now = Date.now();
    return new RouterExecution({
      id: 'router-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RouterExecution {
    return new RouterExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RouterExecution {
    return new RouterExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RouterExecution {
    return new RouterExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RouterExecution {
    if (this.data.tags.includes(tag)) return this;
    return new RouterExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RouterExecution {
    return new RouterExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RouterExecution {
    return new RouterExecution({
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

  toObject(): RouterExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
