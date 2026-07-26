/**
 * MigrationsMetricsSnapshot Entity
 */

export interface MigrationsMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MigrationsMetricsSnapshot {
  readonly data: MigrationsMetricsSnapshotData;

  private constructor(data: MigrationsMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MigrationsMetricsSnapshot {
    const now = Date.now();
    return new MigrationsMetricsSnapshot({
      id: 'migrations-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MigrationsMetricsSnapshot {
    return new MigrationsMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MigrationsMetricsSnapshot {
    return new MigrationsMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MigrationsMetricsSnapshot {
    return new MigrationsMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MigrationsMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new MigrationsMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MigrationsMetricsSnapshot {
    return new MigrationsMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MigrationsMetricsSnapshot {
    return new MigrationsMetricsSnapshot({
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

  toObject(): MigrationsMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
