/**
 * BatchProcessingExecution Entity
 *
 * Tracks a single batch-processing execution.
 */

export interface BatchProcessingExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BatchProcessingExecution {
  readonly data: BatchProcessingExecutionData;

  private constructor(data: BatchProcessingExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): BatchProcessingExecution {
    const now = Date.now();
    return new BatchProcessingExecution({
      id: 'batch-processing-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): BatchProcessingExecution {
    return new BatchProcessingExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): BatchProcessingExecution {
    return new BatchProcessingExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): BatchProcessingExecution {
    return new BatchProcessingExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): BatchProcessingExecution {
    if (this.data.tags.includes(tag)) return this;
    return new BatchProcessingExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): BatchProcessingExecution {
    return new BatchProcessingExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): BatchProcessingExecution {
    return new BatchProcessingExecution({
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

  toObject(): BatchProcessingExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
