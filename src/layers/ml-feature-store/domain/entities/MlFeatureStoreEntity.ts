/**
 * MlFeatureStore Entity
 */

export interface MlFeatureStoreEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class MlFeatureStoreEntity {
  readonly data: MlFeatureStoreEntityData;

  private constructor(data: MlFeatureStoreEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): MlFeatureStoreEntity {
    const now = Date.now();
    return new MlFeatureStoreEntity({
      id: 'ml-feature-store-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MlFeatureStoreEntity {
    return new MlFeatureStoreEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): MlFeatureStoreEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
