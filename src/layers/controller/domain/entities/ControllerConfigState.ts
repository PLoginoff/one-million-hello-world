/**
 * ControllerConfigState Entity
 */

export interface ControllerConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ControllerConfigState {
  readonly data: ControllerConfigStateData;

  private constructor(data: ControllerConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ControllerConfigState {
    const now = Date.now();
    return new ControllerConfigState({
      id: 'controller-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ControllerConfigState {
    return new ControllerConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ControllerConfigState {
    return new ControllerConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ControllerConfigState {
    return new ControllerConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ControllerConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new ControllerConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ControllerConfigState {
    return new ControllerConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ControllerConfigState {
    return new ControllerConfigState({
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

  toObject(): ControllerConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
