/**
 * GovernanceExecution Entity
 *
 * Tracks a single governance execution.
 */

export interface GovernanceExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class GovernanceExecution {
  readonly data: GovernanceExecutionData;

  private constructor(data: GovernanceExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): GovernanceExecution {
    const now = Date.now();
    return new GovernanceExecution({
      id: 'governance-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): GovernanceExecution {
    return new GovernanceExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): GovernanceExecution {
    return new GovernanceExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): GovernanceExecution {
    return new GovernanceExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): GovernanceExecution {
    if (this.data.tags.includes(tag)) return this;
    return new GovernanceExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): GovernanceExecution {
    return new GovernanceExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): GovernanceExecution {
    return new GovernanceExecution({
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

  toObject(): GovernanceExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
