/**
 * EventSourcingMetricsSnapshot Entity
 */

export interface EventSourcingMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class EventSourcingMetricsSnapshot {
  readonly data: EventSourcingMetricsSnapshotData;

  private constructor(data: EventSourcingMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): EventSourcingMetricsSnapshot {
    const now = Date.now();
    return new EventSourcingMetricsSnapshot({
      id: 'event-sourcing-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): EventSourcingMetricsSnapshot {
    return new EventSourcingMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): EventSourcingMetricsSnapshot {
    return new EventSourcingMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): EventSourcingMetricsSnapshot {
    return new EventSourcingMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): EventSourcingMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new EventSourcingMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): EventSourcingMetricsSnapshot {
    return new EventSourcingMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): EventSourcingMetricsSnapshot {
    return new EventSourcingMetricsSnapshot({
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

  toObject(): EventSourcingMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
