/**
 * RepositoryMetrics Entity
 *
 * Holds repository metrics snapshot.
 */

export interface RepositoryMetricsData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RepositoryMetrics {
  readonly data: RepositoryMetricsData;

  private constructor(data: RepositoryMetricsData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RepositoryMetrics {
    const now = Date.now();
    return new RepositoryMetrics({
      id: 'repository-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RepositoryMetrics {
    return new RepositoryMetrics({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RepositoryMetrics {
    return new RepositoryMetrics({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RepositoryMetrics {
    return new RepositoryMetrics({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RepositoryMetrics {
    if (this.data.tags.includes(tag)) return this;
    return new RepositoryMetrics({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RepositoryMetrics {
    return new RepositoryMetrics({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RepositoryMetrics {
    return new RepositoryMetrics({
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

  toObject(): RepositoryMetricsData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
