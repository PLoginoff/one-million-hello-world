/**
 * RateLimitingMetrics Entity
 *
 * Holds rate-limiting metrics snapshot.
 */

export interface RateLimitingMetricsData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RateLimitingMetrics {
  readonly data: RateLimitingMetricsData;

  private constructor(data: RateLimitingMetricsData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RateLimitingMetrics {
    const now = Date.now();
    return new RateLimitingMetrics({
      id: 'rate-limiting-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RateLimitingMetrics {
    return new RateLimitingMetrics({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RateLimitingMetrics {
    return new RateLimitingMetrics({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RateLimitingMetrics {
    return new RateLimitingMetrics({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RateLimitingMetrics {
    if (this.data.tags.includes(tag)) return this;
    return new RateLimitingMetrics({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RateLimitingMetrics {
    return new RateLimitingMetrics({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RateLimitingMetrics {
    return new RateLimitingMetrics({
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

  toObject(): RateLimitingMetricsData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
