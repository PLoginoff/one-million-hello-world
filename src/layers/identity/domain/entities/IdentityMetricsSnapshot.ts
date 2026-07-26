/**
 * IdentityMetricsSnapshot Entity
 */

export interface IdentityMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class IdentityMetricsSnapshot {
  readonly data: IdentityMetricsSnapshotData;

  private constructor(data: IdentityMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): IdentityMetricsSnapshot {
    const now = Date.now();
    return new IdentityMetricsSnapshot({
      id: 'identity-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): IdentityMetricsSnapshot {
    return new IdentityMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): IdentityMetricsSnapshot {
    return new IdentityMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): IdentityMetricsSnapshot {
    return new IdentityMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): IdentityMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new IdentityMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): IdentityMetricsSnapshot {
    return new IdentityMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): IdentityMetricsSnapshot {
    return new IdentityMetricsSnapshot({
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

  toObject(): IdentityMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
