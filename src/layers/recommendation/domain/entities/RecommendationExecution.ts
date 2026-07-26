/**
 * RecommendationExecution Entity
 *
 * Tracks a single recommendation execution.
 */

export interface RecommendationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RecommendationExecution {
  readonly data: RecommendationExecutionData;

  private constructor(data: RecommendationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RecommendationExecution {
    const now = Date.now();
    return new RecommendationExecution({
      id: 'recommendation-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RecommendationExecution {
    return new RecommendationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RecommendationExecution {
    return new RecommendationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RecommendationExecution {
    return new RecommendationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RecommendationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new RecommendationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RecommendationExecution {
    return new RecommendationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RecommendationExecution {
    return new RecommendationExecution({
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

  toObject(): RecommendationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
