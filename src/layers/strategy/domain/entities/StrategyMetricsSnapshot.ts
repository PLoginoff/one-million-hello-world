/**
 * StrategyMetricsSnapshot Entity
 */

export interface StrategyMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class StrategyMetricsSnapshot {
  readonly data: StrategyMetricsSnapshotData;

  private constructor(data: StrategyMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): StrategyMetricsSnapshot {
    const now = Date.now();
    return new StrategyMetricsSnapshot({
      id: 'strategy-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): StrategyMetricsSnapshot {
    return new StrategyMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): StrategyMetricsSnapshot {
    return new StrategyMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): StrategyMetricsSnapshot {
    return new StrategyMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): StrategyMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new StrategyMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): StrategyMetricsSnapshot {
    return new StrategyMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): StrategyMetricsSnapshot {
    return new StrategyMetricsSnapshot({
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

  toObject(): StrategyMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
