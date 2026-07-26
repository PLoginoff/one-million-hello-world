/**
 * BackupConfigState Entity
 */

export interface BackupConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BackupConfigState {
  readonly data: BackupConfigStateData;

  private constructor(data: BackupConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): BackupConfigState {
    const now = Date.now();
    return new BackupConfigState({
      id: 'backup-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): BackupConfigState {
    return new BackupConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): BackupConfigState {
    return new BackupConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): BackupConfigState {
    return new BackupConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): BackupConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new BackupConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): BackupConfigState {
    return new BackupConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): BackupConfigState {
    return new BackupConfigState({
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

  toObject(): BackupConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
