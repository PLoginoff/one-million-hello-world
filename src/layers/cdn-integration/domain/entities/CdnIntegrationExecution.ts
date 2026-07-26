/**
 * CdnIntegrationExecution Entity
 *
 * Tracks a single cdn-integration execution.
 */

export interface CdnIntegrationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CdnIntegrationExecution {
  readonly data: CdnIntegrationExecutionData;

  private constructor(data: CdnIntegrationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CdnIntegrationExecution {
    const now = Date.now();
    return new CdnIntegrationExecution({
      id: 'cdn-integration-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CdnIntegrationExecution {
    return new CdnIntegrationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CdnIntegrationExecution {
    return new CdnIntegrationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CdnIntegrationExecution {
    return new CdnIntegrationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CdnIntegrationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new CdnIntegrationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CdnIntegrationExecution {
    return new CdnIntegrationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CdnIntegrationExecution {
    return new CdnIntegrationExecution({
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

  toObject(): CdnIntegrationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
