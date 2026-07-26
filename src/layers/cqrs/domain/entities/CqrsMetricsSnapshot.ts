/**
 * CqrsMetricsSnapshot Entity
 */

export interface CqrsMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CqrsMetricsSnapshot {
  readonly data: CqrsMetricsSnapshotData;

  private constructor(data: CqrsMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CqrsMetricsSnapshot {
    const now = Date.now();
    return new CqrsMetricsSnapshot({
      id: 'cqrs-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CqrsMetricsSnapshot {
    return new CqrsMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CqrsMetricsSnapshot {
    return new CqrsMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CqrsMetricsSnapshot {
    return new CqrsMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CqrsMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new CqrsMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CqrsMetricsSnapshot {
    return new CqrsMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CqrsMetricsSnapshot {
    return new CqrsMetricsSnapshot({
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

  toObject(): CqrsMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
