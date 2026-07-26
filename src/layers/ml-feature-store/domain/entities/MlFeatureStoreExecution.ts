/**
 * MlFeatureStoreExecution Entity
 *
 * Tracks a single ml-feature-store execution.
 */

export interface MlFeatureStoreExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MlFeatureStoreExecution {
  readonly data: MlFeatureStoreExecutionData;

  private constructor(data: MlFeatureStoreExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MlFeatureStoreExecution {
    const now = Date.now();
    return new MlFeatureStoreExecution({
      id: 'ml-feature-store-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MlFeatureStoreExecution {
    return new MlFeatureStoreExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MlFeatureStoreExecution {
    return new MlFeatureStoreExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MlFeatureStoreExecution {
    return new MlFeatureStoreExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MlFeatureStoreExecution {
    if (this.data.tags.includes(tag)) return this;
    return new MlFeatureStoreExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MlFeatureStoreExecution {
    return new MlFeatureStoreExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MlFeatureStoreExecution {
    return new MlFeatureStoreExecution({
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

  toObject(): MlFeatureStoreExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
