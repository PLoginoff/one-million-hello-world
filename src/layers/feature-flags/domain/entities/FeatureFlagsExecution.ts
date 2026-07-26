/**
 * FeatureFlagsExecution Entity
 *
 * Tracks a single feature-flags execution.
 */

export interface FeatureFlagsExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class FeatureFlagsExecution {
  readonly data: FeatureFlagsExecutionData;

  private constructor(data: FeatureFlagsExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): FeatureFlagsExecution {
    const now = Date.now();
    return new FeatureFlagsExecution({
      id: 'feature-flags-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): FeatureFlagsExecution {
    return new FeatureFlagsExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): FeatureFlagsExecution {
    return new FeatureFlagsExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): FeatureFlagsExecution {
    return new FeatureFlagsExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): FeatureFlagsExecution {
    if (this.data.tags.includes(tag)) return this;
    return new FeatureFlagsExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): FeatureFlagsExecution {
    return new FeatureFlagsExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): FeatureFlagsExecution {
    return new FeatureFlagsExecution({
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

  toObject(): FeatureFlagsExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
