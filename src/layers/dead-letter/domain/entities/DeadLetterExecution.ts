/**
 * DeadLetterExecution Entity
 *
 * Tracks a single dead-letter execution.
 */

export interface DeadLetterExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DeadLetterExecution {
  readonly data: DeadLetterExecutionData;

  private constructor(data: DeadLetterExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DeadLetterExecution {
    const now = Date.now();
    return new DeadLetterExecution({
      id: 'dead-letter-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DeadLetterExecution {
    return new DeadLetterExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DeadLetterExecution {
    return new DeadLetterExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DeadLetterExecution {
    return new DeadLetterExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DeadLetterExecution {
    if (this.data.tags.includes(tag)) return this;
    return new DeadLetterExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DeadLetterExecution {
    return new DeadLetterExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DeadLetterExecution {
    return new DeadLetterExecution({
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

  toObject(): DeadLetterExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
