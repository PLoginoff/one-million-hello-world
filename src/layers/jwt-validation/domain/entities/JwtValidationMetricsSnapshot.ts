/**
 * JwtValidationMetricsSnapshot Entity
 */

export interface JwtValidationMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class JwtValidationMetricsSnapshot {
  readonly data: JwtValidationMetricsSnapshotData;

  private constructor(data: JwtValidationMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): JwtValidationMetricsSnapshot {
    const now = Date.now();
    return new JwtValidationMetricsSnapshot({
      id: 'jwt-validation-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): JwtValidationMetricsSnapshot {
    return new JwtValidationMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): JwtValidationMetricsSnapshot {
    return new JwtValidationMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): JwtValidationMetricsSnapshot {
    return new JwtValidationMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): JwtValidationMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new JwtValidationMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): JwtValidationMetricsSnapshot {
    return new JwtValidationMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): JwtValidationMetricsSnapshot {
    return new JwtValidationMetricsSnapshot({
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

  toObject(): JwtValidationMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
