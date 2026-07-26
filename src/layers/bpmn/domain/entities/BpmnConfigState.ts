/**
 * BpmnConfigState Entity
 */

export interface BpmnConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BpmnConfigState {
  readonly data: BpmnConfigStateData;

  private constructor(data: BpmnConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): BpmnConfigState {
    const now = Date.now();
    return new BpmnConfigState({
      id: 'bpmn-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): BpmnConfigState {
    return new BpmnConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): BpmnConfigState {
    return new BpmnConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): BpmnConfigState {
    return new BpmnConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): BpmnConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new BpmnConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): BpmnConfigState {
    return new BpmnConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): BpmnConfigState {
    return new BpmnConfigState({
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

  toObject(): BpmnConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
