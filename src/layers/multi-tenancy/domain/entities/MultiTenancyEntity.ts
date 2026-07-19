/**
 * MultiTenancy Entity
 */

export interface MultiTenancyEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class MultiTenancyEntity {
  readonly data: MultiTenancyEntityData;

  private constructor(data: MultiTenancyEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): MultiTenancyEntity {
    const now = Date.now();
    return new MultiTenancyEntity({
      id: 'multi-tenancy-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MultiTenancyEntity {
    return new MultiTenancyEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): MultiTenancyEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
