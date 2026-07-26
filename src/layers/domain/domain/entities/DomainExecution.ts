/**
 * DomainExecution Entity
 *
 * Tracks a single domain execution.
 */

export interface DomainExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DomainExecution {
  readonly data: DomainExecutionData;

  private constructor(data: DomainExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DomainExecution {
    const now = Date.now();
    return new DomainExecution({
      id: 'domain-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DomainExecution {
    return new DomainExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DomainExecution {
    return new DomainExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DomainExecution {
    return new DomainExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DomainExecution {
    if (this.data.tags.includes(tag)) return this;
    return new DomainExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DomainExecution {
    return new DomainExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DomainExecution {
    return new DomainExecution({
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

  toObject(): DomainExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
