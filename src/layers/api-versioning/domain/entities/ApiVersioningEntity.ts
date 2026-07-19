/**
 * ApiVersioning Entity
 */

export interface ApiVersioningEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class ApiVersioningEntity {
  readonly data: ApiVersioningEntityData;

  private constructor(data: ApiVersioningEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): ApiVersioningEntity {
    const now = Date.now();
    return new ApiVersioningEntity({
      id: 'api-versioning-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ApiVersioningEntity {
    return new ApiVersioningEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): ApiVersioningEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
