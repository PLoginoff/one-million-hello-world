/**
 * UnitOfWorkMetricsSnapshot Entity
 */

export interface UnitOfWorkMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class UnitOfWorkMetricsSnapshot {
  readonly data: UnitOfWorkMetricsSnapshotData;

  private constructor(data: UnitOfWorkMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): UnitOfWorkMetricsSnapshot {
    const now = Date.now();
    return new UnitOfWorkMetricsSnapshot({
      id: 'unit-of-work-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): UnitOfWorkMetricsSnapshot {
    return new UnitOfWorkMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): UnitOfWorkMetricsSnapshot {
    return new UnitOfWorkMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): UnitOfWorkMetricsSnapshot {
    return new UnitOfWorkMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): UnitOfWorkMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new UnitOfWorkMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): UnitOfWorkMetricsSnapshot {
    return new UnitOfWorkMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): UnitOfWorkMetricsSnapshot {
    return new UnitOfWorkMetricsSnapshot({
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

  toObject(): UnitOfWorkMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
