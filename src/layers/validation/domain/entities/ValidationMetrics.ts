/**
 * ValidationMetrics Entity
 *
 * Holds validation metrics snapshot.
 */

export interface ValidationMetricsData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ValidationMetrics {
  readonly data: ValidationMetricsData;

  private constructor(data: ValidationMetricsData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ValidationMetrics {
    const now = Date.now();
    return new ValidationMetrics({
      id: 'validation-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ValidationMetrics {
    return new ValidationMetrics({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ValidationMetrics {
    return new ValidationMetrics({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ValidationMetrics {
    return new ValidationMetrics({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ValidationMetrics {
    if (this.data.tags.includes(tag)) return this;
    return new ValidationMetrics({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ValidationMetrics {
    return new ValidationMetrics({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ValidationMetrics {
    return new ValidationMetrics({
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

  toObject(): ValidationMetricsData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
