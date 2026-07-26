/**
 * ThrottlingExecution Entity
 *
 * Tracks a single throttling execution.
 */

export interface ThrottlingExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ThrottlingExecution {
  readonly data: ThrottlingExecutionData;

  private constructor(data: ThrottlingExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ThrottlingExecution {
    const now = Date.now();
    return new ThrottlingExecution({
      id: 'throttling-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ThrottlingExecution {
    return new ThrottlingExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ThrottlingExecution {
    return new ThrottlingExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ThrottlingExecution {
    return new ThrottlingExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ThrottlingExecution {
    if (this.data.tags.includes(tag)) return this;
    return new ThrottlingExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ThrottlingExecution {
    return new ThrottlingExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ThrottlingExecution {
    return new ThrottlingExecution({
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

  toObject(): ThrottlingExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
