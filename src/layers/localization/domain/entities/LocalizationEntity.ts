/**
 * Localization Entity
 */

export interface LocalizationEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class LocalizationEntity {
  readonly data: LocalizationEntityData;

  private constructor(data: LocalizationEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): LocalizationEntity {
    const now = Date.now();
    return new LocalizationEntity({
      id: 'localization-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): LocalizationEntity {
    return new LocalizationEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): LocalizationEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
