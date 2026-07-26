/**
 * CacheExecution Entity
 *
 * Tracks a single cache execution.
 */

export interface CacheExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CacheExecution {
  readonly data: CacheExecutionData;

  private constructor(data: CacheExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CacheExecution {
    const now = Date.now();
    return new CacheExecution({
      id: 'cache-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CacheExecution {
    return new CacheExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CacheExecution {
    return new CacheExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CacheExecution {
    return new CacheExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CacheExecution {
    if (this.data.tags.includes(tag)) return this;
    return new CacheExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CacheExecution {
    return new CacheExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CacheExecution {
    return new CacheExecution({
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

  toObject(): CacheExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
