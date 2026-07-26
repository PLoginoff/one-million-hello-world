/**
 * ConfigurationExecution Entity
 *
 * Tracks a single configuration execution.
 */

export interface ConfigurationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ConfigurationExecution {
  readonly data: ConfigurationExecutionData;

  private constructor(data: ConfigurationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ConfigurationExecution {
    const now = Date.now();
    return new ConfigurationExecution({
      id: 'configuration-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ConfigurationExecution {
    return new ConfigurationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ConfigurationExecution {
    return new ConfigurationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ConfigurationExecution {
    return new ConfigurationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ConfigurationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new ConfigurationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ConfigurationExecution {
    return new ConfigurationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ConfigurationExecution {
    return new ConfigurationExecution({
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

  toObject(): ConfigurationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
