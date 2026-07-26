/**
 * FraudDetectionExecution Entity
 *
 * Tracks a single fraud-detection execution.
 */

export interface FraudDetectionExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class FraudDetectionExecution {
  readonly data: FraudDetectionExecutionData;

  private constructor(data: FraudDetectionExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): FraudDetectionExecution {
    const now = Date.now();
    return new FraudDetectionExecution({
      id: 'fraud-detection-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): FraudDetectionExecution {
    return new FraudDetectionExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): FraudDetectionExecution {
    return new FraudDetectionExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): FraudDetectionExecution {
    return new FraudDetectionExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): FraudDetectionExecution {
    if (this.data.tags.includes(tag)) return this;
    return new FraudDetectionExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): FraudDetectionExecution {
    return new FraudDetectionExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): FraudDetectionExecution {
    return new FraudDetectionExecution({
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

  toObject(): FraudDetectionExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
