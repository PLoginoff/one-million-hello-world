/**
 * AuditConfigState Entity
 */

export interface AuditConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AuditConfigState {
  readonly data: AuditConfigStateData;

  private constructor(data: AuditConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): AuditConfigState {
    const now = Date.now();
    return new AuditConfigState({
      id: 'audit-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): AuditConfigState {
    return new AuditConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): AuditConfigState {
    return new AuditConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): AuditConfigState {
    return new AuditConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): AuditConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new AuditConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): AuditConfigState {
    return new AuditConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): AuditConfigState {
    return new AuditConfigState({
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

  toObject(): AuditConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
