/**
 * DataLakeExecution Entity
 *
 * Tracks a single data-lake execution.
 */

export interface DataLakeExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataLakeExecution {
  readonly data: DataLakeExecutionData;

  private constructor(data: DataLakeExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DataLakeExecution {
    const now = Date.now();
    return new DataLakeExecution({
      id: 'data-lake-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DataLakeExecution {
    return new DataLakeExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DataLakeExecution {
    return new DataLakeExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DataLakeExecution {
    return new DataLakeExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DataLakeExecution {
    if (this.data.tags.includes(tag)) return this;
    return new DataLakeExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DataLakeExecution {
    return new DataLakeExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataLakeExecution {
    return new DataLakeExecution({
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

  toObject(): DataLakeExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
