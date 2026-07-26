/**
 * DataTransformationConfigState Entity
 */

export interface DataTransformationConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataTransformationConfigState {
  readonly data: DataTransformationConfigStateData;

  private constructor(data: DataTransformationConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DataTransformationConfigState {
    const now = Date.now();
    return new DataTransformationConfigState({
      id: 'data-transformation-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DataTransformationConfigState {
    return new DataTransformationConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DataTransformationConfigState {
    return new DataTransformationConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DataTransformationConfigState {
    return new DataTransformationConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DataTransformationConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new DataTransformationConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DataTransformationConfigState {
    return new DataTransformationConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataTransformationConfigState {
    return new DataTransformationConfigState({
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

  toObject(): DataTransformationConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
