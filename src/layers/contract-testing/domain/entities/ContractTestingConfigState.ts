/**
 * ContractTestingConfigState Entity
 */

export interface ContractTestingConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ContractTestingConfigState {
  readonly data: ContractTestingConfigStateData;

  private constructor(data: ContractTestingConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ContractTestingConfigState {
    const now = Date.now();
    return new ContractTestingConfigState({
      id: 'contract-testing-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ContractTestingConfigState {
    return new ContractTestingConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ContractTestingConfigState {
    return new ContractTestingConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ContractTestingConfigState {
    return new ContractTestingConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ContractTestingConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new ContractTestingConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ContractTestingConfigState {
    return new ContractTestingConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ContractTestingConfigState {
    return new ContractTestingConfigState({
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

  toObject(): ContractTestingConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
