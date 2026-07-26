/**
 * RouterMetrics Entity
 *
 * Holds router metrics snapshot.
 */

export interface RouterMetricsData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RouterMetrics {
  readonly data: RouterMetricsData;

  private constructor(data: RouterMetricsData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RouterMetrics {
    const now = Date.now();
    return new RouterMetrics({
      id: 'router-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RouterMetrics {
    return new RouterMetrics({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RouterMetrics {
    return new RouterMetrics({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RouterMetrics {
    return new RouterMetrics({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RouterMetrics {
    if (this.data.tags.includes(tag)) return this;
    return new RouterMetrics({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RouterMetrics {
    return new RouterMetrics({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RouterMetrics {
    return new RouterMetrics({
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

  toObject(): RouterMetricsData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
