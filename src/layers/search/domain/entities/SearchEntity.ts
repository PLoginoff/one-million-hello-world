/**
 * Search Entity
 */

export interface SearchEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class SearchEntity {
  readonly data: SearchEntityData;

  private constructor(data: SearchEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): SearchEntity {
    const now = Date.now();
    return new SearchEntity({
      id: 'search-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SearchEntity {
    return new SearchEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): SearchEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
