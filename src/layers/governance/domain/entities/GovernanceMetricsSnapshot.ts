/**
 * GovernanceMetricsSnapshot Entity
 */

export interface GovernanceMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class GovernanceMetricsSnapshot {
  readonly data: GovernanceMetricsSnapshotData;

  private constructor(data: GovernanceMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): GovernanceMetricsSnapshot {
    const now = Date.now();
    return new GovernanceMetricsSnapshot({
      id: 'governance-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): GovernanceMetricsSnapshot {
    return new GovernanceMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): GovernanceMetricsSnapshot {
    return new GovernanceMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): GovernanceMetricsSnapshot {
    return new GovernanceMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): GovernanceMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new GovernanceMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): GovernanceMetricsSnapshot {
    return new GovernanceMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): GovernanceMetricsSnapshot {
    return new GovernanceMetricsSnapshot({
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

  toObject(): GovernanceMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
