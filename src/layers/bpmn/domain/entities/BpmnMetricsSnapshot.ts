/**
 * BpmnMetricsSnapshot Entity
 */

export interface BpmnMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BpmnMetricsSnapshot {
  readonly data: BpmnMetricsSnapshotData;

  private constructor(data: BpmnMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): BpmnMetricsSnapshot {
    const now = Date.now();
    return new BpmnMetricsSnapshot({
      id: 'bpmn-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): BpmnMetricsSnapshot {
    return new BpmnMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): BpmnMetricsSnapshot {
    return new BpmnMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): BpmnMetricsSnapshot {
    return new BpmnMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): BpmnMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new BpmnMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): BpmnMetricsSnapshot {
    return new BpmnMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): BpmnMetricsSnapshot {
    return new BpmnMetricsSnapshot({
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

  toObject(): BpmnMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
