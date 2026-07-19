/**
 * Governance Entity
 */

export interface GovernanceEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class GovernanceEntity {
  readonly data: GovernanceEntityData;

  private constructor(data: GovernanceEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): GovernanceEntity {
    const now = Date.now();
    return new GovernanceEntity({
      id: 'governance-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): GovernanceEntity {
    return new GovernanceEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): GovernanceEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
