/**
 * OutboxExecution Entity
 *
 * Tracks a single outbox execution.
 */

export interface OutboxExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class OutboxExecution {
  readonly data: OutboxExecutionData;

  private constructor(data: OutboxExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): OutboxExecution {
    const now = Date.now();
    return new OutboxExecution({
      id: 'outbox-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): OutboxExecution {
    return new OutboxExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): OutboxExecution {
    return new OutboxExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): OutboxExecution {
    return new OutboxExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): OutboxExecution {
    if (this.data.tags.includes(tag)) return this;
    return new OutboxExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): OutboxExecution {
    return new OutboxExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): OutboxExecution {
    return new OutboxExecution({
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

  toObject(): OutboxExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
