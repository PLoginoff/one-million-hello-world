/**
 * CompressionExecution Entity
 *
 * Tracks a single compression execution.
 */

export interface CompressionExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CompressionExecution {
  readonly data: CompressionExecutionData;

  private constructor(data: CompressionExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CompressionExecution {
    const now = Date.now();
    return new CompressionExecution({
      id: 'compression-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CompressionExecution {
    return new CompressionExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CompressionExecution {
    return new CompressionExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CompressionExecution {
    return new CompressionExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CompressionExecution {
    if (this.data.tags.includes(tag)) return this;
    return new CompressionExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CompressionExecution {
    return new CompressionExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CompressionExecution {
    return new CompressionExecution({
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

  toObject(): CompressionExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
