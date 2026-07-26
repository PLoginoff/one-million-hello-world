/**
 * GraphqlExecution Entity
 *
 * Tracks a single graphql execution.
 */

export interface GraphqlExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class GraphqlExecution {
  readonly data: GraphqlExecutionData;

  private constructor(data: GraphqlExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): GraphqlExecution {
    const now = Date.now();
    return new GraphqlExecution({
      id: 'graphql-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): GraphqlExecution {
    return new GraphqlExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): GraphqlExecution {
    return new GraphqlExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): GraphqlExecution {
    return new GraphqlExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): GraphqlExecution {
    if (this.data.tags.includes(tag)) return this;
    return new GraphqlExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): GraphqlExecution {
    return new GraphqlExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): GraphqlExecution {
    return new GraphqlExecution({
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

  toObject(): GraphqlExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
