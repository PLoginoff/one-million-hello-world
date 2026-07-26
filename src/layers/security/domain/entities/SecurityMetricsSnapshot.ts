/**
 * SecurityMetricsSnapshot Entity
 *
 * Holds security metrics snapshot.
 */

export interface SecurityMetricsSnapshotSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SecurityMetricsSnapshot {
  readonly data: SecurityMetricsSnapshotSnapshotData;

  private constructor(data: SecurityMetricsSnapshotSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SecurityMetricsSnapshot {
    const now = Date.now();
    return new SecurityMetricsSnapshot({
      id: 'security-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SecurityMetricsSnapshot {
    return new SecurityMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SecurityMetricsSnapshot {
    return new SecurityMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SecurityMetricsSnapshot {
    return new SecurityMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SecurityMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new SecurityMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SecurityMetricsSnapshot {
    return new SecurityMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SecurityMetricsSnapshot {
    return new SecurityMetricsSnapshot({
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

  toObject(): SecurityMetricsSnapshotSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
