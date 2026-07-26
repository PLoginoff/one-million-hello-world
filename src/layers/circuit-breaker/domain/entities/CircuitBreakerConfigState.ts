/**
 * CircuitBreakerConfigState Entity
 */

export interface CircuitBreakerConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CircuitBreakerConfigState {
  readonly data: CircuitBreakerConfigStateData;

  private constructor(data: CircuitBreakerConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CircuitBreakerConfigState {
    const now = Date.now();
    return new CircuitBreakerConfigState({
      id: 'circuit-breaker-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CircuitBreakerConfigState {
    return new CircuitBreakerConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CircuitBreakerConfigState {
    return new CircuitBreakerConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CircuitBreakerConfigState {
    return new CircuitBreakerConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CircuitBreakerConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new CircuitBreakerConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CircuitBreakerConfigState {
    return new CircuitBreakerConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CircuitBreakerConfigState {
    return new CircuitBreakerConfigState({
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

  toObject(): CircuitBreakerConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
