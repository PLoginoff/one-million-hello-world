/**
 * ChaosEngineeringMetricsSnapshot Entity
 */

export interface ChaosEngineeringMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ChaosEngineeringMetricsSnapshot {
  readonly data: ChaosEngineeringMetricsSnapshotData;

  private constructor(data: ChaosEngineeringMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ChaosEngineeringMetricsSnapshot {
    const now = Date.now();
    return new ChaosEngineeringMetricsSnapshot({
      id: 'chaos-engineering-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ChaosEngineeringMetricsSnapshot {
    return new ChaosEngineeringMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ChaosEngineeringMetricsSnapshot {
    return new ChaosEngineeringMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ChaosEngineeringMetricsSnapshot {
    return new ChaosEngineeringMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ChaosEngineeringMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new ChaosEngineeringMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ChaosEngineeringMetricsSnapshot {
    return new ChaosEngineeringMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ChaosEngineeringMetricsSnapshot {
    return new ChaosEngineeringMetricsSnapshot({
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

  toObject(): ChaosEngineeringMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
