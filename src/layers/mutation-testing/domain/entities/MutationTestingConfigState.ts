/**
 * MutationTestingConfigState Entity
 */

export interface MutationTestingConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MutationTestingConfigState {
  readonly data: MutationTestingConfigStateData;

  private constructor(data: MutationTestingConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MutationTestingConfigState {
    const now = Date.now();
    return new MutationTestingConfigState({
      id: 'mutation-testing-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MutationTestingConfigState {
    return new MutationTestingConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MutationTestingConfigState {
    return new MutationTestingConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MutationTestingConfigState {
    return new MutationTestingConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MutationTestingConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new MutationTestingConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MutationTestingConfigState {
    return new MutationTestingConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MutationTestingConfigState {
    return new MutationTestingConfigState({
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

  toObject(): MutationTestingConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
