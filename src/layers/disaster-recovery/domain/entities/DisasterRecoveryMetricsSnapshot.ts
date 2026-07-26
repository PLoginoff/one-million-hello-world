/**
 * DisasterRecoveryMetricsSnapshot Entity
 */

export interface DisasterRecoveryMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DisasterRecoveryMetricsSnapshot {
  readonly data: DisasterRecoveryMetricsSnapshotData;

  private constructor(data: DisasterRecoveryMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DisasterRecoveryMetricsSnapshot {
    const now = Date.now();
    return new DisasterRecoveryMetricsSnapshot({
      id: 'disaster-recovery-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DisasterRecoveryMetricsSnapshot {
    return new DisasterRecoveryMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DisasterRecoveryMetricsSnapshot {
    return new DisasterRecoveryMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DisasterRecoveryMetricsSnapshot {
    return new DisasterRecoveryMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DisasterRecoveryMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new DisasterRecoveryMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DisasterRecoveryMetricsSnapshot {
    return new DisasterRecoveryMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DisasterRecoveryMetricsSnapshot {
    return new DisasterRecoveryMetricsSnapshot({
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

  toObject(): DisasterRecoveryMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
