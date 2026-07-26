/**
 * CqrsExecution Entity
 *
 * Tracks a single cqrs execution.
 */

export interface CqrsExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CqrsExecution {
  readonly data: CqrsExecutionData;

  private constructor(data: CqrsExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CqrsExecution {
    const now = Date.now();
    return new CqrsExecution({
      id: 'cqrs-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CqrsExecution {
    return new CqrsExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CqrsExecution {
    return new CqrsExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CqrsExecution {
    return new CqrsExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CqrsExecution {
    if (this.data.tags.includes(tag)) return this;
    return new CqrsExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CqrsExecution {
    return new CqrsExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CqrsExecution {
    return new CqrsExecution({
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

  toObject(): CqrsExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
