/**
 * OnboardingExecution Entity
 *
 * Tracks a single onboarding execution.
 */

export interface OnboardingExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class OnboardingExecution {
  readonly data: OnboardingExecutionData;

  private constructor(data: OnboardingExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): OnboardingExecution {
    const now = Date.now();
    return new OnboardingExecution({
      id: 'onboarding-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): OnboardingExecution {
    return new OnboardingExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): OnboardingExecution {
    return new OnboardingExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): OnboardingExecution {
    return new OnboardingExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): OnboardingExecution {
    if (this.data.tags.includes(tag)) return this;
    return new OnboardingExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): OnboardingExecution {
    return new OnboardingExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): OnboardingExecution {
    return new OnboardingExecution({
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

  toObject(): OnboardingExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
