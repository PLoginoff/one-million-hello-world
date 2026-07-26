/**
 * GraphqlConfigState Entity
 */

export interface GraphqlConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class GraphqlConfigState {
  readonly data: GraphqlConfigStateData;

  private constructor(data: GraphqlConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): GraphqlConfigState {
    const now = Date.now();
    return new GraphqlConfigState({
      id: 'graphql-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): GraphqlConfigState {
    return new GraphqlConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): GraphqlConfigState {
    return new GraphqlConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): GraphqlConfigState {
    return new GraphqlConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): GraphqlConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new GraphqlConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): GraphqlConfigState {
    return new GraphqlConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): GraphqlConfigState {
    return new GraphqlConfigState({
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

  toObject(): GraphqlConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
