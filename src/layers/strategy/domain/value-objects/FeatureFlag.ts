/**
 * Feature Flag Value Object
 * 
 * Represents feature flag configuration.
 * Immutable value object for feature flag management.
 */

export interface FeatureFlagData {
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetAudience: string[];
  conditions: FlagCondition[];
  metadata: Record<string, unknown>;
}

export interface FlagCondition {
  type: 'user-id' | 'user-group' | 'custom' | 'percentage';
  operator: 'equals' | 'not-equals' | 'contains' | 'not-contains' | 'greater-than' | 'less-than';
  value: unknown;
}

export class FeatureFlag {
  readonly data: FeatureFlagData;

  constructor(data: FeatureFlagData) {
    this._validateFlag(data);
    this.data = { ...data, conditions: [...data.conditions] };
  }

  /**
   * Get flag name
   */
  getName(): string {
    return this.data.name;
  }

  /**
   * Get description
   */
  getDescription(): string {
    return this.data.description;
  }

  /**
   * Check if flag is enabled
   */
  isEnabled(): boolean {
    return this.data.enabled;
  }

  /**
   * Get rollout percentage
   */
  getRolloutPercentage(): number {
    return this.data.rolloutPercentage;
  }

  /**
   * Get target audience
   */
  getTargetAudience(): string[] {
    return [...this.data.targetAudience];
  }

  /**
   * Get conditions
   */
  getConditions(): FlagCondition[] {
    return [...this.data.conditions];
  }

  /**
   * Get metadata
   */
  getMetadata(): Record<string, unknown> {
    return { ...this.data.metadata };
  }

  /**
   * Check if user is in target audience
   */
  isInTargetAudience(userId: string): boolean {
    return this.data.targetAudience.includes(userId);
  }

  /**
   * Check if flag is fully rolled out
   */
  isFullyRolledOut(): boolean {
    return this.data.rolloutPercentage === 100;
  }

  /**
   * Check if flag is partially rolled out
   */
  isPartiallyRolledOut(): boolean {
    return this.data.rolloutPercentage > 0 && this.data.rolloutPercentage < 100;
  }

  /**
   * Evaluate flag for user
   */
  evaluateForUser(userId: string, userAttributes?: Record<string, unknown>): boolean {
    if (!this.data.enabled) {
      return false;
    }

    if (this.isInTargetAudience(userId)) {
      return true;
    }

    if (this.data.conditions.length > 0) {
      return this._evaluateConditions(userId, userAttributes);
    }

    return this._evaluatePercentage(userId);
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<FeatureFlagData>): FeatureFlag {
    return new FeatureFlag({ ...this.data, ...updates });
  }

  /**
   * Enable flag
   */
  enable(): FeatureFlag {
    return this.withUpdates({ enabled: true });
  }

  /**
   * Disable flag
   */
  disable(): FeatureFlag {
    return this.withUpdates({ enabled: false });
  }

  /**
   * Set rollout percentage
   */
  setRolloutPercentage(percentage: number): FeatureFlag {
    return this.withUpdates({ rolloutPercentage: percentage });
  }

  private _evaluateConditions(userId: string, userAttributes?: Record<string, unknown>): boolean {
    for (const condition of this.data.conditions) {
      if (this._evaluateCondition(condition, userId, userAttributes)) {
        return true;
      }
    }
    return false;
  }

  private _evaluateCondition(
    condition: FlagCondition,
    userId: string,
    userAttributes?: Record<string, unknown>,
  ): boolean {
    const value = condition.value;

    switch (condition.type) {
      case 'user-id':
        return this._evaluateOperator(condition.operator, userId, value);
      case 'user-group':
        const groups = userAttributes?.['groups'] as string[] || [];
        return groups.some((group) => this._evaluateOperator(condition.operator, group, value));
      case 'custom':
        if (userAttributes) {
          const attrValue = userAttributes[condition.value as string];
          return this._evaluateOperator(condition.operator, attrValue, value);
        }
        return false;
      default:
        return false;
    }
  }

  private _evaluateOperator(operator: string, actual: unknown, expected: unknown): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not-equals':
        return actual !== expected;
      case 'contains':
        return typeof actual === 'string' && actual.includes(expected as string);
      case 'not-contains':
        return typeof actual === 'string' && !actual.includes(expected as string);
      case 'greater-than':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'less-than':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      default:
        return false;
    }
  }

  private _evaluatePercentage(userId: string): boolean {
    const hash = this._hashCode(userId);
    const percentage = Math.abs(hash) % 100;
    return percentage < this.data.rolloutPercentage;
  }

  private _hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }

  private _validateFlag(data: FeatureFlagData): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Flag name is required');
    }

    if (data.rolloutPercentage < 0 || data.rolloutPercentage > 100) {
      throw new Error('Rollout percentage must be between 0 and 100');
    }

    if (data.rolloutPercentage > 0 && !data.enabled) {
      throw new Error('Flag must be enabled to have rollout percentage');
    }
  }
}
