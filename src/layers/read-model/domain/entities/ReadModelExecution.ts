/**
 * ReadModelExecution Entity
 *
 * Tracks a single read-model execution.
 */

export interface ReadModelExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ReadModelExecution {
  readonly data: ReadModelExecutionData;

  private constructor(data: ReadModelExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ReadModelExecution {
    const now = Date.now();
    return new ReadModelExecution({
      id: 'read-model-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ReadModelExecution {
    return new ReadModelExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ReadModelExecution {
    return new ReadModelExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ReadModelExecution {
    return new ReadModelExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ReadModelExecution {
    if (this.data.tags.includes(tag)) return this;
    return new ReadModelExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ReadModelExecution {
    return new ReadModelExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ReadModelExecution {
    return new ReadModelExecution({
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

  toObject(): ReadModelExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
