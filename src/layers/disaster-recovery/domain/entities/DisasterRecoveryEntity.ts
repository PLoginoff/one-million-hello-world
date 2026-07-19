/**
 * DisasterRecovery Entity
 */

export interface DisasterRecoveryEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class DisasterRecoveryEntity {
  readonly data: DisasterRecoveryEntityData;

  private constructor(data: DisasterRecoveryEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): DisasterRecoveryEntity {
    const now = Date.now();
    return new DisasterRecoveryEntity({
      id: 'disaster-recovery-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DisasterRecoveryEntity {
    return new DisasterRecoveryEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): DisasterRecoveryEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
