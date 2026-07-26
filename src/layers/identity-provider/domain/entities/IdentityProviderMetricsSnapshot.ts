/**
 * IdentityProviderMetricsSnapshot Entity
 */

export interface IdentityProviderMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class IdentityProviderMetricsSnapshot {
  readonly data: IdentityProviderMetricsSnapshotData;

  private constructor(data: IdentityProviderMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): IdentityProviderMetricsSnapshot {
    const now = Date.now();
    return new IdentityProviderMetricsSnapshot({
      id: 'identity-provider-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): IdentityProviderMetricsSnapshot {
    return new IdentityProviderMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): IdentityProviderMetricsSnapshot {
    return new IdentityProviderMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): IdentityProviderMetricsSnapshot {
    return new IdentityProviderMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): IdentityProviderMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new IdentityProviderMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): IdentityProviderMetricsSnapshot {
    return new IdentityProviderMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): IdentityProviderMetricsSnapshot {
    return new IdentityProviderMetricsSnapshot({
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

  toObject(): IdentityProviderMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
