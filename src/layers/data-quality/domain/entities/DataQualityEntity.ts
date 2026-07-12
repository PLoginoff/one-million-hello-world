/**
 * DataQuality Entity
 *
 * Core domain entity for the Data quality validation layer.
 */

export class DataQualityEntity {
  readonly id: string;
  readonly createdAt: Date;
  readonly data: Record<string, unknown>;

  constructor(id: string, data: Record<string, unknown>) {
    this.id = id;
    this.createdAt = new Date();
    this.data = { ...data };
  }

  static create(data: Record<string, unknown>): DataQualityEntity {
    return new DataQualityEntity(`data-quality-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`, data);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt.toISOString(),
      data: this.data,
    };
  }
}
