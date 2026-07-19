/**
 * BatchProcessing Entity
 */

export interface BatchProcessingEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class BatchProcessingEntity {
  readonly data: BatchProcessingEntityData;

  private constructor(data: BatchProcessingEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): BatchProcessingEntity {
    const now = Date.now();
    return new BatchProcessingEntity({
      id: 'batch-processing-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): BatchProcessingEntity {
    return new BatchProcessingEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): BatchProcessingEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
