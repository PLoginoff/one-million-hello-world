/**
 * EdgeCacheExecution Entity
 *
 * Tracks a single edge-cache execution.
 */

export interface EdgeCacheExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class EdgeCacheExecution {
  readonly data: EdgeCacheExecutionData;

  private constructor(data: EdgeCacheExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): EdgeCacheExecution {
    const now = Date.now();
    return new EdgeCacheExecution({
      id: 'edge-cache-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): EdgeCacheExecution {
    return new EdgeCacheExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): EdgeCacheExecution {
    return new EdgeCacheExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): EdgeCacheExecution {
    return new EdgeCacheExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): EdgeCacheExecution {
    if (this.data.tags.includes(tag)) return this;
    return new EdgeCacheExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): EdgeCacheExecution {
    return new EdgeCacheExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): EdgeCacheExecution {
    return new EdgeCacheExecution({
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

  toObject(): EdgeCacheExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
