/**
 * DisasterRecoveryExecution Entity
 *
 * Tracks a single disaster-recovery execution.
 */

export interface DisasterRecoveryExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DisasterRecoveryExecution {
  readonly data: DisasterRecoveryExecutionData;

  private constructor(data: DisasterRecoveryExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DisasterRecoveryExecution {
    const now = Date.now();
    return new DisasterRecoveryExecution({
      id: 'disaster-recovery-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DisasterRecoveryExecution {
    return new DisasterRecoveryExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DisasterRecoveryExecution {
    return new DisasterRecoveryExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DisasterRecoveryExecution {
    return new DisasterRecoveryExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DisasterRecoveryExecution {
    if (this.data.tags.includes(tag)) return this;
    return new DisasterRecoveryExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DisasterRecoveryExecution {
    return new DisasterRecoveryExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DisasterRecoveryExecution {
    return new DisasterRecoveryExecution({
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

  toObject(): DisasterRecoveryExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
