/**
 * MutationTestingMetricsSnapshot Entity
 */

export interface MutationTestingMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MutationTestingMetricsSnapshot {
  readonly data: MutationTestingMetricsSnapshotData;

  private constructor(data: MutationTestingMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MutationTestingMetricsSnapshot {
    const now = Date.now();
    return new MutationTestingMetricsSnapshot({
      id: 'mutation-testing-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MutationTestingMetricsSnapshot {
    return new MutationTestingMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MutationTestingMetricsSnapshot {
    return new MutationTestingMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MutationTestingMetricsSnapshot {
    return new MutationTestingMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MutationTestingMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new MutationTestingMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MutationTestingMetricsSnapshot {
    return new MutationTestingMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MutationTestingMetricsSnapshot {
    return new MutationTestingMetricsSnapshot({
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

  toObject(): MutationTestingMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
