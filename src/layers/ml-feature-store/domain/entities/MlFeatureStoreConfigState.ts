/**
 * MlFeatureStoreConfigState Entity
 */

export interface MlFeatureStoreConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MlFeatureStoreConfigState {
  readonly data: MlFeatureStoreConfigStateData;

  private constructor(data: MlFeatureStoreConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MlFeatureStoreConfigState {
    const now = Date.now();
    return new MlFeatureStoreConfigState({
      id: 'ml-feature-store-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MlFeatureStoreConfigState {
    return new MlFeatureStoreConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MlFeatureStoreConfigState {
    return new MlFeatureStoreConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MlFeatureStoreConfigState {
    return new MlFeatureStoreConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MlFeatureStoreConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new MlFeatureStoreConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MlFeatureStoreConfigState {
    return new MlFeatureStoreConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MlFeatureStoreConfigState {
    return new MlFeatureStoreConfigState({
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

  toObject(): MlFeatureStoreConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
