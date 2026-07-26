/**
 * GovernanceConfigState Entity
 */

export interface GovernanceConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class GovernanceConfigState {
  readonly data: GovernanceConfigStateData;

  private constructor(data: GovernanceConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): GovernanceConfigState {
    const now = Date.now();
    return new GovernanceConfigState({
      id: 'governance-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): GovernanceConfigState {
    return new GovernanceConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): GovernanceConfigState {
    return new GovernanceConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): GovernanceConfigState {
    return new GovernanceConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): GovernanceConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new GovernanceConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): GovernanceConfigState {
    return new GovernanceConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): GovernanceConfigState {
    return new GovernanceConfigState({
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

  toObject(): GovernanceConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
