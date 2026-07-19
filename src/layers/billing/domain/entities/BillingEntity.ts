/**
 * Billing Entity
 */

export interface BillingEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class BillingEntity {
  readonly data: BillingEntityData;

  private constructor(data: BillingEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): BillingEntity {
    const now = Date.now();
    return new BillingEntity({
      id: 'billing-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): BillingEntity {
    return new BillingEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): BillingEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
