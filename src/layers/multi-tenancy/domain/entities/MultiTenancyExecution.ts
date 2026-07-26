/**
 * MultiTenancyExecution Entity
 *
 * Tracks a single multi-tenancy execution.
 */

export interface MultiTenancyExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MultiTenancyExecution {
  readonly data: MultiTenancyExecutionData;

  private constructor(data: MultiTenancyExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MultiTenancyExecution {
    const now = Date.now();
    return new MultiTenancyExecution({
      id: 'multi-tenancy-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MultiTenancyExecution {
    return new MultiTenancyExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MultiTenancyExecution {
    return new MultiTenancyExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MultiTenancyExecution {
    return new MultiTenancyExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MultiTenancyExecution {
    if (this.data.tags.includes(tag)) return this;
    return new MultiTenancyExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MultiTenancyExecution {
    return new MultiTenancyExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MultiTenancyExecution {
    return new MultiTenancyExecution({
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

  toObject(): MultiTenancyExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
