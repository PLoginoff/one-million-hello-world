/**
 * Reporting Entity
 */

export interface ReportingEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class ReportingEntity {
  readonly data: ReportingEntityData;

  private constructor(data: ReportingEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): ReportingEntity {
    const now = Date.now();
    return new ReportingEntity({
      id: 'reporting-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ReportingEntity {
    return new ReportingEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): ReportingEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
