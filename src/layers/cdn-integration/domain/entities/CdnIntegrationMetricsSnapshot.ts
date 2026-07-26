/**
 * CdnIntegrationMetricsSnapshot Entity
 */

export interface CdnIntegrationMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CdnIntegrationMetricsSnapshot {
  readonly data: CdnIntegrationMetricsSnapshotData;

  private constructor(data: CdnIntegrationMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CdnIntegrationMetricsSnapshot {
    const now = Date.now();
    return new CdnIntegrationMetricsSnapshot({
      id: 'cdn-integration-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CdnIntegrationMetricsSnapshot {
    return new CdnIntegrationMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CdnIntegrationMetricsSnapshot {
    return new CdnIntegrationMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CdnIntegrationMetricsSnapshot {
    return new CdnIntegrationMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CdnIntegrationMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new CdnIntegrationMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CdnIntegrationMetricsSnapshot {
    return new CdnIntegrationMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CdnIntegrationMetricsSnapshot {
    return new CdnIntegrationMetricsSnapshot({
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

  toObject(): CdnIntegrationMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
