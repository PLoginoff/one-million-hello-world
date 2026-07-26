/**
 * BatchProcessingConfigState Entity
 */

export interface BatchProcessingConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BatchProcessingConfigState {
  readonly data: BatchProcessingConfigStateData;

  private constructor(data: BatchProcessingConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): BatchProcessingConfigState {
    const now = Date.now();
    return new BatchProcessingConfigState({
      id: 'batch-processing-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): BatchProcessingConfigState {
    return new BatchProcessingConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): BatchProcessingConfigState {
    return new BatchProcessingConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): BatchProcessingConfigState {
    return new BatchProcessingConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): BatchProcessingConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new BatchProcessingConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): BatchProcessingConfigState {
    return new BatchProcessingConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): BatchProcessingConfigState {
    return new BatchProcessingConfigState({
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

  toObject(): BatchProcessingConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
