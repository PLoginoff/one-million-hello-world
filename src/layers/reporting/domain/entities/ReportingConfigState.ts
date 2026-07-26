/**
 * ReportingConfigState Entity
 */

export interface ReportingConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ReportingConfigState {
  readonly data: ReportingConfigStateData;

  private constructor(data: ReportingConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ReportingConfigState {
    const now = Date.now();
    return new ReportingConfigState({
      id: 'reporting-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ReportingConfigState {
    return new ReportingConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ReportingConfigState {
    return new ReportingConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ReportingConfigState {
    return new ReportingConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ReportingConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new ReportingConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ReportingConfigState {
    return new ReportingConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ReportingConfigState {
    return new ReportingConfigState({
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

  toObject(): ReportingConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
