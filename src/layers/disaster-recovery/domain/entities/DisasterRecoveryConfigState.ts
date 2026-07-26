/**
 * DisasterRecoveryConfigState Entity
 */

export interface DisasterRecoveryConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DisasterRecoveryConfigState {
  readonly data: DisasterRecoveryConfigStateData;

  private constructor(data: DisasterRecoveryConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DisasterRecoveryConfigState {
    const now = Date.now();
    return new DisasterRecoveryConfigState({
      id: 'disaster-recovery-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DisasterRecoveryConfigState {
    return new DisasterRecoveryConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DisasterRecoveryConfigState {
    return new DisasterRecoveryConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DisasterRecoveryConfigState {
    return new DisasterRecoveryConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DisasterRecoveryConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new DisasterRecoveryConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DisasterRecoveryConfigState {
    return new DisasterRecoveryConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DisasterRecoveryConfigState {
    return new DisasterRecoveryConfigState({
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

  toObject(): DisasterRecoveryConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
