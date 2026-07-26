/**
 * DdosProtectionMetricsSnapshot Entity
 */

export interface DdosProtectionMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DdosProtectionMetricsSnapshot {
  readonly data: DdosProtectionMetricsSnapshotData;

  private constructor(data: DdosProtectionMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DdosProtectionMetricsSnapshot {
    const now = Date.now();
    return new DdosProtectionMetricsSnapshot({
      id: 'ddos-protection-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DdosProtectionMetricsSnapshot {
    return new DdosProtectionMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DdosProtectionMetricsSnapshot {
    return new DdosProtectionMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DdosProtectionMetricsSnapshot {
    return new DdosProtectionMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DdosProtectionMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new DdosProtectionMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DdosProtectionMetricsSnapshot {
    return new DdosProtectionMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DdosProtectionMetricsSnapshot {
    return new DdosProtectionMetricsSnapshot({
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

  toObject(): DdosProtectionMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
