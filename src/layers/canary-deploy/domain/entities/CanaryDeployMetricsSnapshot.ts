/**
 * CanaryDeployMetricsSnapshot Entity
 */

export interface CanaryDeployMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CanaryDeployMetricsSnapshot {
  readonly data: CanaryDeployMetricsSnapshotData;

  private constructor(data: CanaryDeployMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CanaryDeployMetricsSnapshot {
    const now = Date.now();
    return new CanaryDeployMetricsSnapshot({
      id: 'canary-deploy-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CanaryDeployMetricsSnapshot {
    return new CanaryDeployMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CanaryDeployMetricsSnapshot {
    return new CanaryDeployMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CanaryDeployMetricsSnapshot {
    return new CanaryDeployMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CanaryDeployMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new CanaryDeployMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CanaryDeployMetricsSnapshot {
    return new CanaryDeployMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CanaryDeployMetricsSnapshot {
    return new CanaryDeployMetricsSnapshot({
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

  toObject(): CanaryDeployMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
