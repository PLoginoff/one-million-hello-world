/**
 * ControllerMetrics Entity
 *
 * Holds controller metrics snapshot.
 */

export interface ControllerMetricsData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ControllerMetrics {
  readonly data: ControllerMetricsData;

  private constructor(data: ControllerMetricsData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ControllerMetrics {
    const now = Date.now();
    return new ControllerMetrics({
      id: 'controller-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ControllerMetrics {
    return new ControllerMetrics({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ControllerMetrics {
    return new ControllerMetrics({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ControllerMetrics {
    return new ControllerMetrics({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ControllerMetrics {
    if (this.data.tags.includes(tag)) return this;
    return new ControllerMetrics({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ControllerMetrics {
    return new ControllerMetrics({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ControllerMetrics {
    return new ControllerMetrics({
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

  toObject(): ControllerMetricsData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
