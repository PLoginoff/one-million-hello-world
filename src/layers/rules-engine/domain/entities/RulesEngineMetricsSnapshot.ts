/**
 * RulesEngineMetricsSnapshot Entity
 */

export interface RulesEngineMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RulesEngineMetricsSnapshot {
  readonly data: RulesEngineMetricsSnapshotData;

  private constructor(data: RulesEngineMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RulesEngineMetricsSnapshot {
    const now = Date.now();
    return new RulesEngineMetricsSnapshot({
      id: 'rules-engine-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RulesEngineMetricsSnapshot {
    return new RulesEngineMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RulesEngineMetricsSnapshot {
    return new RulesEngineMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RulesEngineMetricsSnapshot {
    return new RulesEngineMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RulesEngineMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new RulesEngineMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RulesEngineMetricsSnapshot {
    return new RulesEngineMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RulesEngineMetricsSnapshot {
    return new RulesEngineMetricsSnapshot({
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

  toObject(): RulesEngineMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
