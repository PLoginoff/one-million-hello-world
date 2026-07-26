/**
 * ChaosEngineeringConfigState Entity
 */

export interface ChaosEngineeringConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ChaosEngineeringConfigState {
  readonly data: ChaosEngineeringConfigStateData;

  private constructor(data: ChaosEngineeringConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ChaosEngineeringConfigState {
    const now = Date.now();
    return new ChaosEngineeringConfigState({
      id: 'chaos-engineering-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ChaosEngineeringConfigState {
    return new ChaosEngineeringConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ChaosEngineeringConfigState {
    return new ChaosEngineeringConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ChaosEngineeringConfigState {
    return new ChaosEngineeringConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ChaosEngineeringConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new ChaosEngineeringConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ChaosEngineeringConfigState {
    return new ChaosEngineeringConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ChaosEngineeringConfigState {
    return new ChaosEngineeringConfigState({
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

  toObject(): ChaosEngineeringConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
