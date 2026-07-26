/**
 * HttpParserConfigState Entity
 */

export interface HttpParserConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class HttpParserConfigState {
  readonly data: HttpParserConfigStateData;

  private constructor(data: HttpParserConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): HttpParserConfigState {
    const now = Date.now();
    return new HttpParserConfigState({
      id: 'http-parser-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): HttpParserConfigState {
    return new HttpParserConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): HttpParserConfigState {
    return new HttpParserConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): HttpParserConfigState {
    return new HttpParserConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): HttpParserConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new HttpParserConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): HttpParserConfigState {
    return new HttpParserConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): HttpParserConfigState {
    return new HttpParserConfigState({
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

  toObject(): HttpParserConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
