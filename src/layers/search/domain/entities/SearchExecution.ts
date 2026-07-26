/**
 * SearchExecution Entity
 *
 * Tracks a single search execution.
 */

export interface SearchExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SearchExecution {
  readonly data: SearchExecutionData;

  private constructor(data: SearchExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SearchExecution {
    const now = Date.now();
    return new SearchExecution({
      id: 'search-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SearchExecution {
    return new SearchExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SearchExecution {
    return new SearchExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SearchExecution {
    return new SearchExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SearchExecution {
    if (this.data.tags.includes(tag)) return this;
    return new SearchExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SearchExecution {
    return new SearchExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SearchExecution {
    return new SearchExecution({
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

  toObject(): SearchExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
