/**
 * QueryObjectExecution Entity
 *
 * Tracks a single query-object execution.
 */

export interface QueryObjectExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class QueryObjectExecution {
  readonly data: QueryObjectExecutionData;

  private constructor(data: QueryObjectExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): QueryObjectExecution {
    const now = Date.now();
    return new QueryObjectExecution({
      id: 'query-object-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): QueryObjectExecution {
    return new QueryObjectExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): QueryObjectExecution {
    return new QueryObjectExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): QueryObjectExecution {
    return new QueryObjectExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): QueryObjectExecution {
    if (this.data.tags.includes(tag)) return this;
    return new QueryObjectExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): QueryObjectExecution {
    return new QueryObjectExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): QueryObjectExecution {
    return new QueryObjectExecution({
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

  toObject(): QueryObjectExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
