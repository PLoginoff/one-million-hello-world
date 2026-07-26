/**
 * BackupExecution Entity
 *
 * Tracks a single backup execution.
 */

export interface BackupExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BackupExecution {
  readonly data: BackupExecutionData;

  private constructor(data: BackupExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): BackupExecution {
    const now = Date.now();
    return new BackupExecution({
      id: 'backup-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): BackupExecution {
    return new BackupExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): BackupExecution {
    return new BackupExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): BackupExecution {
    return new BackupExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): BackupExecution {
    if (this.data.tags.includes(tag)) return this;
    return new BackupExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): BackupExecution {
    return new BackupExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): BackupExecution {
    return new BackupExecution({
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

  toObject(): BackupExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
