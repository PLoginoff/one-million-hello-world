/**
 * AnomalyDetectionMetricsSnapshot Entity
 */

export interface AnomalyDetectionMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AnomalyDetectionMetricsSnapshot {
  readonly data: AnomalyDetectionMetricsSnapshotData;

  private constructor(data: AnomalyDetectionMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): AnomalyDetectionMetricsSnapshot {
    const now = Date.now();
    return new AnomalyDetectionMetricsSnapshot({
      id: 'anomaly-detection-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): AnomalyDetectionMetricsSnapshot {
    return new AnomalyDetectionMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): AnomalyDetectionMetricsSnapshot {
    return new AnomalyDetectionMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): AnomalyDetectionMetricsSnapshot {
    return new AnomalyDetectionMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): AnomalyDetectionMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new AnomalyDetectionMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): AnomalyDetectionMetricsSnapshot {
    return new AnomalyDetectionMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): AnomalyDetectionMetricsSnapshot {
    return new AnomalyDetectionMetricsSnapshot({
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

  toObject(): AnomalyDetectionMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
