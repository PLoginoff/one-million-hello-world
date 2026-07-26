/**
 * DecoratorExecution Entity
 *
 * Tracks a single decorator execution.
 */

export interface DecoratorExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DecoratorExecution {
  readonly data: DecoratorExecutionData;

  private constructor(data: DecoratorExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DecoratorExecution {
    const now = Date.now();
    return new DecoratorExecution({
      id: 'decorator-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DecoratorExecution {
    return new DecoratorExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DecoratorExecution {
    return new DecoratorExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DecoratorExecution {
    return new DecoratorExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DecoratorExecution {
    if (this.data.tags.includes(tag)) return this;
    return new DecoratorExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DecoratorExecution {
    return new DecoratorExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DecoratorExecution {
    return new DecoratorExecution({
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

  toObject(): DecoratorExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
