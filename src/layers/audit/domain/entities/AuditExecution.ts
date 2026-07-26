/**
 * AuditExecution Entity
 *
 * Tracks a single audit execution.
 */

export interface AuditExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AuditExecution {
  readonly data: AuditExecutionData;

  private constructor(data: AuditExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): AuditExecution {
    const now = Date.now();
    return new AuditExecution({
      id: 'audit-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): AuditExecution {
    return new AuditExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): AuditExecution {
    return new AuditExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): AuditExecution {
    return new AuditExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): AuditExecution {
    if (this.data.tags.includes(tag)) return this;
    return new AuditExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): AuditExecution {
    return new AuditExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): AuditExecution {
    return new AuditExecution({
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

  toObject(): AuditExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
