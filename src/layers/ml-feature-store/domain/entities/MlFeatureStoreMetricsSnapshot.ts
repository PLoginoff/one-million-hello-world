/**
 * MlFeatureStoreMetricsSnapshot Entity
 */

export interface MlFeatureStoreMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MlFeatureStoreMetricsSnapshot {
  readonly data: MlFeatureStoreMetricsSnapshotData;

  private constructor(data: MlFeatureStoreMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MlFeatureStoreMetricsSnapshot {
    const now = Date.now();
    return new MlFeatureStoreMetricsSnapshot({
      id: 'ml-feature-store-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MlFeatureStoreMetricsSnapshot {
    return new MlFeatureStoreMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MlFeatureStoreMetricsSnapshot {
    return new MlFeatureStoreMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MlFeatureStoreMetricsSnapshot {
    return new MlFeatureStoreMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MlFeatureStoreMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new MlFeatureStoreMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MlFeatureStoreMetricsSnapshot {
    return new MlFeatureStoreMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MlFeatureStoreMetricsSnapshot {
    return new MlFeatureStoreMetricsSnapshot({
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

  toObject(): MlFeatureStoreMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
