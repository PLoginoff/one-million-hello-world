/**
 * CostOptimizationExecution Entity
 *
 * Tracks a single cost-optimization execution.
 */

export interface CostOptimizationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CostOptimizationExecution {
  readonly data: CostOptimizationExecutionData;

  private constructor(data: CostOptimizationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CostOptimizationExecution {
    const now = Date.now();
    return new CostOptimizationExecution({
      id: 'cost-optimization-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CostOptimizationExecution {
    return new CostOptimizationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CostOptimizationExecution {
    return new CostOptimizationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CostOptimizationExecution {
    return new CostOptimizationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CostOptimizationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new CostOptimizationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CostOptimizationExecution {
    return new CostOptimizationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CostOptimizationExecution {
    return new CostOptimizationExecution({
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

  toObject(): CostOptimizationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
