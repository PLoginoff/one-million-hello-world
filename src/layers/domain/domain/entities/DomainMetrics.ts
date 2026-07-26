/**
 * DomainMetrics Entity
 *
 * Holds domain metrics snapshot.
 */

export interface DomainMetricsData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DomainMetrics {
  readonly data: DomainMetricsData;

  private constructor(data: DomainMetricsData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DomainMetrics {
    const now = Date.now();
    return new DomainMetrics({
      id: 'domain-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DomainMetrics {
    return new DomainMetrics({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DomainMetrics {
    return new DomainMetrics({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DomainMetrics {
    return new DomainMetrics({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DomainMetrics {
    if (this.data.tags.includes(tag)) return this;
    return new DomainMetrics({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DomainMetrics {
    return new DomainMetrics({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DomainMetrics {
    return new DomainMetrics({
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

  toObject(): DomainMetricsData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
