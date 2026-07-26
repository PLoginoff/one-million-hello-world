/**
 * ContractTestingExecution Entity
 *
 * Tracks a single contract-testing execution.
 */

export interface ContractTestingExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ContractTestingExecution {
  readonly data: ContractTestingExecutionData;

  private constructor(data: ContractTestingExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ContractTestingExecution {
    const now = Date.now();
    return new ContractTestingExecution({
      id: 'contract-testing-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ContractTestingExecution {
    return new ContractTestingExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ContractTestingExecution {
    return new ContractTestingExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ContractTestingExecution {
    return new ContractTestingExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ContractTestingExecution {
    if (this.data.tags.includes(tag)) return this;
    return new ContractTestingExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ContractTestingExecution {
    return new ContractTestingExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ContractTestingExecution {
    return new ContractTestingExecution({
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

  toObject(): ContractTestingExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
