/**
 * LocalizationConfigState Entity
 */

export interface LocalizationConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class LocalizationConfigState {
  readonly data: LocalizationConfigStateData;

  private constructor(data: LocalizationConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): LocalizationConfigState {
    const now = Date.now();
    return new LocalizationConfigState({
      id: 'localization-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): LocalizationConfigState {
    return new LocalizationConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): LocalizationConfigState {
    return new LocalizationConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): LocalizationConfigState {
    return new LocalizationConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): LocalizationConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new LocalizationConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): LocalizationConfigState {
    return new LocalizationConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): LocalizationConfigState {
    return new LocalizationConfigState({
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

  toObject(): LocalizationConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
