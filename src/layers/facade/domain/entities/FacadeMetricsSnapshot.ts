/**
 * FacadeMetricsSnapshot Entity
 */

export interface FacadeMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class FacadeMetricsSnapshot {
  readonly data: FacadeMetricsSnapshotData;

  private constructor(data: FacadeMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): FacadeMetricsSnapshot {
    const now = Date.now();
    return new FacadeMetricsSnapshot({
      id: 'facade-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): FacadeMetricsSnapshot {
    return new FacadeMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): FacadeMetricsSnapshot {
    return new FacadeMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): FacadeMetricsSnapshot {
    return new FacadeMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): FacadeMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new FacadeMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): FacadeMetricsSnapshot {
    return new FacadeMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): FacadeMetricsSnapshot {
    return new FacadeMetricsSnapshot({
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

  toObject(): FacadeMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
