/**
 * AnalyticsExecution Entity
 *
 * Tracks a single analytics execution.
 */

export interface AnalyticsExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AnalyticsExecution {
  readonly data: AnalyticsExecutionData;

  private constructor(data: AnalyticsExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): AnalyticsExecution {
    const now = Date.now();
    return new AnalyticsExecution({
      id: 'analytics-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): AnalyticsExecution {
    return new AnalyticsExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): AnalyticsExecution {
    return new AnalyticsExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): AnalyticsExecution {
    return new AnalyticsExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): AnalyticsExecution {
    if (this.data.tags.includes(tag)) return this;
    return new AnalyticsExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): AnalyticsExecution {
    return new AnalyticsExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): AnalyticsExecution {
    return new AnalyticsExecution({
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

  toObject(): AnalyticsExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
