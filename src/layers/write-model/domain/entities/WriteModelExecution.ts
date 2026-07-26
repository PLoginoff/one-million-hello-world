/**
 * WriteModelExecution Entity
 *
 * Tracks a single write-model execution.
 */

export interface WriteModelExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class WriteModelExecution {
  readonly data: WriteModelExecutionData;

  private constructor(data: WriteModelExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): WriteModelExecution {
    const now = Date.now();
    return new WriteModelExecution({
      id: 'write-model-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): WriteModelExecution {
    return new WriteModelExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): WriteModelExecution {
    return new WriteModelExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): WriteModelExecution {
    return new WriteModelExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): WriteModelExecution {
    if (this.data.tags.includes(tag)) return this;
    return new WriteModelExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): WriteModelExecution {
    return new WriteModelExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): WriteModelExecution {
    return new WriteModelExecution({
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

  toObject(): WriteModelExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
