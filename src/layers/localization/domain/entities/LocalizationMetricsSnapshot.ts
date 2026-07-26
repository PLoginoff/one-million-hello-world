/**
 * LocalizationMetricsSnapshot Entity
 */

export interface LocalizationMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class LocalizationMetricsSnapshot {
  readonly data: LocalizationMetricsSnapshotData;

  private constructor(data: LocalizationMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): LocalizationMetricsSnapshot {
    const now = Date.now();
    return new LocalizationMetricsSnapshot({
      id: 'localization-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): LocalizationMetricsSnapshot {
    return new LocalizationMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): LocalizationMetricsSnapshot {
    return new LocalizationMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): LocalizationMetricsSnapshot {
    return new LocalizationMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): LocalizationMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new LocalizationMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): LocalizationMetricsSnapshot {
    return new LocalizationMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): LocalizationMetricsSnapshot {
    return new LocalizationMetricsSnapshot({
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

  toObject(): LocalizationMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
