/**
 * CostOptimization Entity
 */

export interface CostOptimizationEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class CostOptimizationEntity {
  readonly data: CostOptimizationEntityData;

  private constructor(data: CostOptimizationEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): CostOptimizationEntity {
    const now = Date.now();
    return new CostOptimizationEntity({
      id: 'cost-optimization-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CostOptimizationEntity {
    return new CostOptimizationEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): CostOptimizationEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
