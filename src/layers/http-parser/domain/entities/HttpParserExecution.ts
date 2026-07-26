/**
 * HttpParserExecution Entity
 *
 * Tracks a single http-parser execution.
 */

export interface HttpParserExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class HttpParserExecution {
  readonly data: HttpParserExecutionData;

  private constructor(data: HttpParserExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): HttpParserExecution {
    const now = Date.now();
    return new HttpParserExecution({
      id: 'http-parser-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): HttpParserExecution {
    return new HttpParserExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): HttpParserExecution {
    return new HttpParserExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): HttpParserExecution {
    return new HttpParserExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): HttpParserExecution {
    if (this.data.tags.includes(tag)) return this;
    return new HttpParserExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): HttpParserExecution {
    return new HttpParserExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): HttpParserExecution {
    return new HttpParserExecution({
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

  toObject(): HttpParserExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
