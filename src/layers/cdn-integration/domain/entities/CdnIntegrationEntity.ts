/**
 * CdnIntegration Entity
 */

export interface CdnIntegrationEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class CdnIntegrationEntity {
  readonly data: CdnIntegrationEntityData;

  private constructor(data: CdnIntegrationEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): CdnIntegrationEntity {
    const now = Date.now();
    return new CdnIntegrationEntity({
      id: 'cdn-integration-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CdnIntegrationEntity {
    return new CdnIntegrationEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): CdnIntegrationEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
