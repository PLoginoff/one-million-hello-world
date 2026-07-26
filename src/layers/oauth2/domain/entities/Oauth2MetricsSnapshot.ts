/**
 * Oauth2MetricsSnapshot Entity
 */

export interface Oauth2MetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class Oauth2MetricsSnapshot {
  readonly data: Oauth2MetricsSnapshotData;

  private constructor(data: Oauth2MetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): Oauth2MetricsSnapshot {
    const now = Date.now();
    return new Oauth2MetricsSnapshot({
      id: 'oauth2-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): Oauth2MetricsSnapshot {
    return new Oauth2MetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): Oauth2MetricsSnapshot {
    return new Oauth2MetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): Oauth2MetricsSnapshot {
    return new Oauth2MetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): Oauth2MetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new Oauth2MetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): Oauth2MetricsSnapshot {
    return new Oauth2MetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): Oauth2MetricsSnapshot {
    return new Oauth2MetricsSnapshot({
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

  toObject(): Oauth2MetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
