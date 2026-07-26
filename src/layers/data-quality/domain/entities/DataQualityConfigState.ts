/**
 * DataQualityConfigState Entity
 */

export interface DataQualityConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataQualityConfigState {
  readonly data: DataQualityConfigStateData;

  private constructor(data: DataQualityConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DataQualityConfigState {
    const now = Date.now();
    return new DataQualityConfigState({
      id: 'data-quality-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DataQualityConfigState {
    return new DataQualityConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DataQualityConfigState {
    return new DataQualityConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DataQualityConfigState {
    return new DataQualityConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DataQualityConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new DataQualityConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DataQualityConfigState {
    return new DataQualityConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataQualityConfigState {
    return new DataQualityConfigState({
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

  toObject(): DataQualityConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
