/**
 * DataTransformationExecution Entity
 *
 * Tracks a single data-transformation execution.
 */

export interface DataTransformationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataTransformationExecution {
  readonly data: DataTransformationExecutionData;

  private constructor(data: DataTransformationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DataTransformationExecution {
    const now = Date.now();
    return new DataTransformationExecution({
      id: 'data-transformation-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DataTransformationExecution {
    return new DataTransformationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DataTransformationExecution {
    return new DataTransformationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DataTransformationExecution {
    return new DataTransformationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DataTransformationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new DataTransformationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DataTransformationExecution {
    return new DataTransformationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataTransformationExecution {
    return new DataTransformationExecution({
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

  toObject(): DataTransformationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
