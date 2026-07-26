/**
 * PolicyEngineMetricsSnapshot Entity
 */

export interface PolicyEngineMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class PolicyEngineMetricsSnapshot {
  readonly data: PolicyEngineMetricsSnapshotData;

  private constructor(data: PolicyEngineMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): PolicyEngineMetricsSnapshot {
    const now = Date.now();
    return new PolicyEngineMetricsSnapshot({
      id: 'policy-engine-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): PolicyEngineMetricsSnapshot {
    return new PolicyEngineMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): PolicyEngineMetricsSnapshot {
    return new PolicyEngineMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): PolicyEngineMetricsSnapshot {
    return new PolicyEngineMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): PolicyEngineMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new PolicyEngineMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): PolicyEngineMetricsSnapshot {
    return new PolicyEngineMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): PolicyEngineMetricsSnapshot {
    return new PolicyEngineMetricsSnapshot({
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

  toObject(): PolicyEngineMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
