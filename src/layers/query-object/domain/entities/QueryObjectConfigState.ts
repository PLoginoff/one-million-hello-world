/**
 * QueryObjectConfigState Entity
 */

export interface QueryObjectConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class QueryObjectConfigState {
  readonly data: QueryObjectConfigStateData;

  private constructor(data: QueryObjectConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): QueryObjectConfigState {
    const now = Date.now();
    return new QueryObjectConfigState({
      id: 'query-object-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): QueryObjectConfigState {
    return new QueryObjectConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): QueryObjectConfigState {
    return new QueryObjectConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): QueryObjectConfigState {
    return new QueryObjectConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): QueryObjectConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new QueryObjectConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): QueryObjectConfigState {
    return new QueryObjectConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): QueryObjectConfigState {
    return new QueryObjectConfigState({
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

  toObject(): QueryObjectConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
