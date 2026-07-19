/**
 * Recommendation Entity
 */

export interface RecommendationEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class RecommendationEntity {
  readonly data: RecommendationEntityData;

  private constructor(data: RecommendationEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): RecommendationEntity {
    const now = Date.now();
    return new RecommendationEntity({
      id: 'recommendation-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RecommendationEntity {
    return new RecommendationEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): RecommendationEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
