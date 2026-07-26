/**
 * DataLakeConfigState Entity
 */

export interface DataLakeConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataLakeConfigState {
  readonly data: DataLakeConfigStateData;

  private constructor(data: DataLakeConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DataLakeConfigState {
    const now = Date.now();
    return new DataLakeConfigState({
      id: 'data-lake-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DataLakeConfigState {
    return new DataLakeConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DataLakeConfigState {
    return new DataLakeConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DataLakeConfigState {
    return new DataLakeConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DataLakeConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new DataLakeConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DataLakeConfigState {
    return new DataLakeConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataLakeConfigState {
    return new DataLakeConfigState({
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

  toObject(): DataLakeConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
