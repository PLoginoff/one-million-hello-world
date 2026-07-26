/**
 * FraudDetectionMetricsSnapshot Entity
 */

export interface FraudDetectionMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class FraudDetectionMetricsSnapshot {
  readonly data: FraudDetectionMetricsSnapshotData;

  private constructor(data: FraudDetectionMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): FraudDetectionMetricsSnapshot {
    const now = Date.now();
    return new FraudDetectionMetricsSnapshot({
      id: 'fraud-detection-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): FraudDetectionMetricsSnapshot {
    return new FraudDetectionMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): FraudDetectionMetricsSnapshot {
    return new FraudDetectionMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): FraudDetectionMetricsSnapshot {
    return new FraudDetectionMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): FraudDetectionMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new FraudDetectionMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): FraudDetectionMetricsSnapshot {
    return new FraudDetectionMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): FraudDetectionMetricsSnapshot {
    return new FraudDetectionMetricsSnapshot({
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

  toObject(): FraudDetectionMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
