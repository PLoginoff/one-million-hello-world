/**
 * AnalyticsConfigState Entity
 */

export interface AnalyticsConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AnalyticsConfigState {
  readonly data: AnalyticsConfigStateData;

  private constructor(data: AnalyticsConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): AnalyticsConfigState {
    const now = Date.now();
    return new AnalyticsConfigState({
      id: 'analytics-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): AnalyticsConfigState {
    return new AnalyticsConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): AnalyticsConfigState {
    return new AnalyticsConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): AnalyticsConfigState {
    return new AnalyticsConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): AnalyticsConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new AnalyticsConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): AnalyticsConfigState {
    return new AnalyticsConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): AnalyticsConfigState {
    return new AnalyticsConfigState({
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

  toObject(): AnalyticsConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
