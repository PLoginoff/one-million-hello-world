/**
 * DataLineage Entity
 */

export interface DataLineageEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class DataLineageEntity {
  readonly data: DataLineageEntityData;

  private constructor(data: DataLineageEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): DataLineageEntity {
    const now = Date.now();
    return new DataLineageEntity({
      id: 'data-lineage-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataLineageEntity {
    return new DataLineageEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): DataLineageEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
