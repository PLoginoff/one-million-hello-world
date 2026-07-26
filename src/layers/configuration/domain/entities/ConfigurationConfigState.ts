/**
 * ConfigurationConfigState Entity
 */

export interface ConfigurationConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ConfigurationConfigState {
  readonly data: ConfigurationConfigStateData;

  private constructor(data: ConfigurationConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ConfigurationConfigState {
    const now = Date.now();
    return new ConfigurationConfigState({
      id: 'configuration-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ConfigurationConfigState {
    return new ConfigurationConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ConfigurationConfigState {
    return new ConfigurationConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ConfigurationConfigState {
    return new ConfigurationConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ConfigurationConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new ConfigurationConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ConfigurationConfigState {
    return new ConfigurationConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ConfigurationConfigState {
    return new ConfigurationConfigState({
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

  toObject(): ConfigurationConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
