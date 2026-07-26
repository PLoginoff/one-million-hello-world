/**
 * DataQualityExecution Entity
 *
 * Tracks a single data-quality execution.
 */

export interface DataQualityExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataQualityExecution {
  readonly data: DataQualityExecutionData;

  private constructor(data: DataQualityExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DataQualityExecution {
    const now = Date.now();
    return new DataQualityExecution({
      id: 'data-quality-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DataQualityExecution {
    return new DataQualityExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DataQualityExecution {
    return new DataQualityExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DataQualityExecution {
    return new DataQualityExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DataQualityExecution {
    if (this.data.tags.includes(tag)) return this;
    return new DataQualityExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DataQualityExecution {
    return new DataQualityExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataQualityExecution {
    return new DataQualityExecution({
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

  toObject(): DataQualityExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
