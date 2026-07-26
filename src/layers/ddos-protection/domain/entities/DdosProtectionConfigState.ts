/**
 * DdosProtectionConfigState Entity
 */

export interface DdosProtectionConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DdosProtectionConfigState {
  readonly data: DdosProtectionConfigStateData;

  private constructor(data: DdosProtectionConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DdosProtectionConfigState {
    const now = Date.now();
    return new DdosProtectionConfigState({
      id: 'ddos-protection-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DdosProtectionConfigState {
    return new DdosProtectionConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DdosProtectionConfigState {
    return new DdosProtectionConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DdosProtectionConfigState {
    return new DdosProtectionConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DdosProtectionConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new DdosProtectionConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DdosProtectionConfigState {
    return new DdosProtectionConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DdosProtectionConfigState {
    return new DdosProtectionConfigState({
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

  toObject(): DdosProtectionConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
