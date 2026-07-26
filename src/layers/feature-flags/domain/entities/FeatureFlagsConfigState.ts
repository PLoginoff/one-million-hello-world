/**
 * FeatureFlagsConfigState Entity
 */

export interface FeatureFlagsConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class FeatureFlagsConfigState {
  readonly data: FeatureFlagsConfigStateData;

  private constructor(data: FeatureFlagsConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): FeatureFlagsConfigState {
    const now = Date.now();
    return new FeatureFlagsConfigState({
      id: 'feature-flags-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): FeatureFlagsConfigState {
    return new FeatureFlagsConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): FeatureFlagsConfigState {
    return new FeatureFlagsConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): FeatureFlagsConfigState {
    return new FeatureFlagsConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): FeatureFlagsConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new FeatureFlagsConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): FeatureFlagsConfigState {
    return new FeatureFlagsConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): FeatureFlagsConfigState {
    return new FeatureFlagsConfigState({
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

  toObject(): FeatureFlagsConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
