/**
 * HttpParserMetricsSnapshot Entity
 */

export interface HttpParserMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class HttpParserMetricsSnapshot {
  readonly data: HttpParserMetricsSnapshotData;

  private constructor(data: HttpParserMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): HttpParserMetricsSnapshot {
    const now = Date.now();
    return new HttpParserMetricsSnapshot({
      id: 'http-parser-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): HttpParserMetricsSnapshot {
    return new HttpParserMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): HttpParserMetricsSnapshot {
    return new HttpParserMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): HttpParserMetricsSnapshot {
    return new HttpParserMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): HttpParserMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new HttpParserMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): HttpParserMetricsSnapshot {
    return new HttpParserMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): HttpParserMetricsSnapshot {
    return new HttpParserMetricsSnapshot({
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

  toObject(): HttpParserMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
