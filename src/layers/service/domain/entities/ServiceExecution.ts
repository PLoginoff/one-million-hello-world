/**
 * ServiceExecution Entity
 *
 * Tracks a single service execution.
 */

export interface ServiceExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ServiceExecution {
  readonly data: ServiceExecutionData;

  private constructor(data: ServiceExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ServiceExecution {
    const now = Date.now();
    return new ServiceExecution({
      id: 'service-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ServiceExecution {
    return new ServiceExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ServiceExecution {
    return new ServiceExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ServiceExecution {
    return new ServiceExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ServiceExecution {
    if (this.data.tags.includes(tag)) return this;
    return new ServiceExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ServiceExecution {
    return new ServiceExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ServiceExecution {
    return new ServiceExecution({
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

  toObject(): ServiceExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
