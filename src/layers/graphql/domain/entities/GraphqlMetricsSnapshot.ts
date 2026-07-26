/**
 * GraphqlMetricsSnapshot Entity
 */

export interface GraphqlMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class GraphqlMetricsSnapshot {
  readonly data: GraphqlMetricsSnapshotData;

  private constructor(data: GraphqlMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): GraphqlMetricsSnapshot {
    const now = Date.now();
    return new GraphqlMetricsSnapshot({
      id: 'graphql-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): GraphqlMetricsSnapshot {
    return new GraphqlMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): GraphqlMetricsSnapshot {
    return new GraphqlMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): GraphqlMetricsSnapshot {
    return new GraphqlMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): GraphqlMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new GraphqlMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): GraphqlMetricsSnapshot {
    return new GraphqlMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): GraphqlMetricsSnapshot {
    return new GraphqlMetricsSnapshot({
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

  toObject(): GraphqlMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
