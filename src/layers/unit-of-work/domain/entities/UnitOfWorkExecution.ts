/**
 * UnitOfWorkExecution Entity
 *
 * Tracks a single unit-of-work execution.
 */

export interface UnitOfWorkExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class UnitOfWorkExecution {
  readonly data: UnitOfWorkExecutionData;

  private constructor(data: UnitOfWorkExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): UnitOfWorkExecution {
    const now = Date.now();
    return new UnitOfWorkExecution({
      id: 'unit-of-work-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): UnitOfWorkExecution {
    return new UnitOfWorkExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): UnitOfWorkExecution {
    return new UnitOfWorkExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): UnitOfWorkExecution {
    return new UnitOfWorkExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): UnitOfWorkExecution {
    if (this.data.tags.includes(tag)) return this;
    return new UnitOfWorkExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): UnitOfWorkExecution {
    return new UnitOfWorkExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): UnitOfWorkExecution {
    return new UnitOfWorkExecution({
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

  toObject(): UnitOfWorkExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
