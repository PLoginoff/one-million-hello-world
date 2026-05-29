/**
 * Rate Limit Rule Value Object
 *
 * Represents rate limit rules for specific clients or resources.
 * Immutable value object for managing rate limit rules.
 */

export interface RateLimitRuleData {
  clientId: string;
  resource: string;
  config: RateLimitConfigData;
  priority: number;
  enabled: boolean;
  conditions: RuleCondition[];
}

export interface RuleCondition {
  type: 'ip' | 'user' | 'api-key' | 'custom';
  operator: 'equals' | 'not-equals' | 'contains' | 'not-contains' | 'in' | 'not-in';
  value: unknown;
}

export interface RateLimitConfigData {
  limit: number;
  window: number;
  windowUnit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days';
  algorithm: 'token-bucket' | 'leaky-bucket' | 'fixed-window' | 'sliding-window' | 'distributed';
  burstLimit?: number;
  distributed: boolean;
}

export class RateLimitRule {
  readonly data: RateLimitRuleData;

  constructor(data: RateLimitRuleData) {
    this._validateRule(data);
    this.data = { ...data, conditions: [...data.conditions] };
  }

  /**
   * Get client ID
   */
  getClientId(): string {
    return this.data.clientId;
  }

  /**
   * Get resource
   */
  getResource(): string {
    return this.data.resource;
  }

  /**
   * Get config
   */
  getConfig(): RateLimitConfigData {
    return { ...this.data.config };
  }

  /**
   * Get priority
   */
  getPriority(): number {
    return this.data.priority;
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.data.enabled;
  }

  /**
   * Get conditions
   */
  getConditions(): RuleCondition[] {
    return [...this.data.conditions];
  }

  /**
   * Check if rule matches request
   */
  matchesRequest(clientId: string, resource: string, context?: Record<string, unknown>): boolean {
    if (this.data.clientId !== '*' && this.data.clientId !== clientId) {
      return false;
    }

    if (this.data.resource !== '*' && this.data.resource !== resource) {
      return false;
    }

    if (!this.data.enabled) {
      return false;
    }

    if (this.data.conditions.length > 0) {
      return this._evaluateConditions(context);
    }

    return true;
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<RateLimitRuleData>): RateLimitRule {
    return new RateLimitRule({ ...this.data, ...updates });
  }

  /**
   * Enable rule
   */
  enable(): RateLimitRule {
    return this.withUpdates({ enabled: true });
  }

  /**
   * Disable rule
   */
  disable(): RateLimitRule {
    return this.withUpdates({ enabled: false });
  }

  /**
   * Create a copy
   */
  clone(): RateLimitRule {
    return new RateLimitRule({ ...this.data, conditions: [...this.data.conditions] });
  }

  /**
   * Create wildcard rule
   */
  static createWildcard(config: RateLimitConfigData): RateLimitRule {
    return new RateLimitRule({
      clientId: '*',
      resource: '*',
      config,
      priority: 0,
      enabled: true,
      conditions: [],
    });
  }

  private _evaluateConditions(context?: Record<string, unknown>): boolean {
    if (!context) {
      return false;
    }

    for (const condition of this.data.conditions) {
      if (!this._evaluateCondition(condition, context)) {
        return false;
      }
    }

    return true;
  }

  private _evaluateCondition(condition: RuleCondition, context: Record<string, unknown>): boolean {
    const value = condition.value;

    switch (condition.type) {
      case 'custom':
        if (typeof condition.value === 'string' && condition.value in context) {
          const contextValue = context[condition.value];
          return this._evaluateOperator(condition.operator, contextValue, value);
        }
        return false;
      default:
        return true;
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
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not-in':
        return Array.isArray(expected) && !expected.includes(actual);
      default:
        return true;
    }
  }

  private _validateRule(data: RateLimitRuleData): void {
    if (!data.clientId || data.clientId.trim().length === 0) {
      throw new Error('Client ID is required');
    }

    if (!data.resource || data.resource.trim().length === 0) {
      throw new Error('Resource is required');
    }

    if (data.config.limit < 1) {
      throw new Error('Config limit must be at least 1');
    }
  }
}
