/**
 * MiddlewareMetrics Entity
 *
 * Holds middleware metrics snapshot.
 */

export interface MiddlewareMetricsData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MiddlewareMetrics {
  readonly data: MiddlewareMetricsData;

  private constructor(data: MiddlewareMetricsData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MiddlewareMetrics {
    const now = Date.now();
    return new MiddlewareMetrics({
      id: 'middleware-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MiddlewareMetrics {
    return new MiddlewareMetrics({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MiddlewareMetrics {
    return new MiddlewareMetrics({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MiddlewareMetrics {
    return new MiddlewareMetrics({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MiddlewareMetrics {
    if (this.data.tags.includes(tag)) return this;
    return new MiddlewareMetrics({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MiddlewareMetrics {
    return new MiddlewareMetrics({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MiddlewareMetrics {
    return new MiddlewareMetrics({
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

  toObject(): MiddlewareMetricsData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
