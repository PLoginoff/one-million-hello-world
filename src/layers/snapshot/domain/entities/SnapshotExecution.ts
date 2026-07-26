/**
 * SnapshotExecution Entity
 *
 * Tracks a single snapshot execution.
 */

export interface SnapshotExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SnapshotExecution {
  readonly data: SnapshotExecutionData;

  private constructor(data: SnapshotExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SnapshotExecution {
    const now = Date.now();
    return new SnapshotExecution({
      id: 'snapshot-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SnapshotExecution {
    return new SnapshotExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SnapshotExecution {
    return new SnapshotExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SnapshotExecution {
    return new SnapshotExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SnapshotExecution {
    if (this.data.tags.includes(tag)) return this;
    return new SnapshotExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SnapshotExecution {
    return new SnapshotExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SnapshotExecution {
    return new SnapshotExecution({
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

  toObject(): SnapshotExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
