/**
 * PerformanceTestingConfigState Entity
 */

export interface PerformanceTestingConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class PerformanceTestingConfigState {
  readonly data: PerformanceTestingConfigStateData;

  private constructor(data: PerformanceTestingConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): PerformanceTestingConfigState {
    const now = Date.now();
    return new PerformanceTestingConfigState({
      id: 'performance-testing-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): PerformanceTestingConfigState {
    return new PerformanceTestingConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): PerformanceTestingConfigState {
    return new PerformanceTestingConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): PerformanceTestingConfigState {
    return new PerformanceTestingConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): PerformanceTestingConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new PerformanceTestingConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): PerformanceTestingConfigState {
    return new PerformanceTestingConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): PerformanceTestingConfigState {
    return new PerformanceTestingConfigState({
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

  toObject(): PerformanceTestingConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
