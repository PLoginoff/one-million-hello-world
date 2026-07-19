/**
 * SecretsRotation Entity
 */

export interface SecretsRotationEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class SecretsRotationEntity {
  readonly data: SecretsRotationEntityData;

  private constructor(data: SecretsRotationEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): SecretsRotationEntity {
    const now = Date.now();
    return new SecretsRotationEntity({
      id: 'secrets-rotation-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SecretsRotationEntity {
    return new SecretsRotationEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): SecretsRotationEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
