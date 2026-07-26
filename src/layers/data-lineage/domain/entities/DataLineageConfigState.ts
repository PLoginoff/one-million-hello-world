/**
 * DataLineageConfigState Entity
 */

export interface DataLineageConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataLineageConfigState {
  readonly data: DataLineageConfigStateData;

  private constructor(data: DataLineageConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DataLineageConfigState {
    const now = Date.now();
    return new DataLineageConfigState({
      id: 'data-lineage-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DataLineageConfigState {
    return new DataLineageConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DataLineageConfigState {
    return new DataLineageConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DataLineageConfigState {
    return new DataLineageConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DataLineageConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new DataLineageConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DataLineageConfigState {
    return new DataLineageConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataLineageConfigState {
    return new DataLineageConfigState({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  isPending(): boolean {
    return this.data.status === 'pending';
  }
  isActive(): boolean {
    return this.data.status === 'active';
  }
  isCompleted(): boolean {
    return this.data.status === 'completed';
  }
  isFailed(): boolean {
    return this.data.status === 'failed';
  }

  toObject(): DataLineageConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
