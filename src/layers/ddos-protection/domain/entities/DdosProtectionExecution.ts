/**
 * DdosProtectionExecution Entity
 *
 * Tracks a single ddos-protection execution.
 */

export interface DdosProtectionExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DdosProtectionExecution {
  readonly data: DdosProtectionExecutionData;

  private constructor(data: DdosProtectionExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DdosProtectionExecution {
    const now = Date.now();
    return new DdosProtectionExecution({
      id: 'ddos-protection-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DdosProtectionExecution {
    return new DdosProtectionExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DdosProtectionExecution {
    return new DdosProtectionExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DdosProtectionExecution {
    return new DdosProtectionExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DdosProtectionExecution {
    if (this.data.tags.includes(tag)) return this;
    return new DdosProtectionExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DdosProtectionExecution {
    return new DdosProtectionExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DdosProtectionExecution {
    return new DdosProtectionExecution({
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

  toObject(): DdosProtectionExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
