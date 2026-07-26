/**
 * WorkflowEngineMetricsSnapshot Entity
 */

export interface WorkflowEngineMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class WorkflowEngineMetricsSnapshot {
  readonly data: WorkflowEngineMetricsSnapshotData;

  private constructor(data: WorkflowEngineMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): WorkflowEngineMetricsSnapshot {
    const now = Date.now();
    return new WorkflowEngineMetricsSnapshot({
      id: 'workflow-engine-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): WorkflowEngineMetricsSnapshot {
    return new WorkflowEngineMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): WorkflowEngineMetricsSnapshot {
    return new WorkflowEngineMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): WorkflowEngineMetricsSnapshot {
    return new WorkflowEngineMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): WorkflowEngineMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new WorkflowEngineMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): WorkflowEngineMetricsSnapshot {
    return new WorkflowEngineMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): WorkflowEngineMetricsSnapshot {
    return new WorkflowEngineMetricsSnapshot({
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

  toObject(): WorkflowEngineMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
