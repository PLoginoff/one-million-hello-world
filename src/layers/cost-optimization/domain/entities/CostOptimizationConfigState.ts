/**
 * CostOptimizationConfigState Entity
 */

export interface CostOptimizationConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CostOptimizationConfigState {
  readonly data: CostOptimizationConfigStateData;

  private constructor(data: CostOptimizationConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CostOptimizationConfigState {
    const now = Date.now();
    return new CostOptimizationConfigState({
      id: 'cost-optimization-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CostOptimizationConfigState {
    return new CostOptimizationConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CostOptimizationConfigState {
    return new CostOptimizationConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CostOptimizationConfigState {
    return new CostOptimizationConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CostOptimizationConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new CostOptimizationConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CostOptimizationConfigState {
    return new CostOptimizationConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CostOptimizationConfigState {
    return new CostOptimizationConfigState({
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

  toObject(): CostOptimizationConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
