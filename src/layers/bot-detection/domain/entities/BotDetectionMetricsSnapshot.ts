/**
 * BotDetectionMetricsSnapshot Entity
 */

export interface BotDetectionMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BotDetectionMetricsSnapshot {
  readonly data: BotDetectionMetricsSnapshotData;

  private constructor(data: BotDetectionMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): BotDetectionMetricsSnapshot {
    const now = Date.now();
    return new BotDetectionMetricsSnapshot({
      id: 'bot-detection-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): BotDetectionMetricsSnapshot {
    return new BotDetectionMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): BotDetectionMetricsSnapshot {
    return new BotDetectionMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): BotDetectionMetricsSnapshot {
    return new BotDetectionMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): BotDetectionMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new BotDetectionMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): BotDetectionMetricsSnapshot {
    return new BotDetectionMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): BotDetectionMetricsSnapshot {
    return new BotDetectionMetricsSnapshot({
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

  toObject(): BotDetectionMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
