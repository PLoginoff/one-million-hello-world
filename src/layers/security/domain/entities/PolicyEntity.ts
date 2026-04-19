/**
 * Policy Entity
 * 
 * Represents a security policy with rules and conditions.
 */

import { SecurityLevel } from '../../types/security-types';

export interface PolicyRule {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
  effect: 'allow' | 'deny';
}

export interface PolicyData {
  id: string;
  name: string;
  description: string;
  securityLevel: SecurityLevel;
  rules: PolicyRule[];
  enabled: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export class PolicyEntity {
  readonly data: PolicyData;

  private constructor(data: PolicyData) {
    this.data = { ...data };
  }

  /**
   * Create policy entity
   */
  static create(data: PolicyData): PolicyEntity {
    return new PolicyEntity(data);
  }

  /**
   * Create simple policy
   */
  static createSimple(
    id: string,
    name: string,
    description: string,
    securityLevel: SecurityLevel,
    rules: PolicyRule[]
  ): PolicyEntity {
    const now = Date.now();
    return new PolicyEntity({
      id,
      name,
      description,
      securityLevel,
      rules,
      enabled: true,
      priority: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Check if policy is enabled
   */
  isEnabled(): boolean {
    return this.data.enabled;
  }

  /**
   * Enable policy
   */
  enable(): PolicyEntity {
    return new PolicyEntity({
      ...this.data,
      enabled: true,
      updatedAt: Date.now(),
    });
  }

  /**
   * Disable policy
   */
  disable(): PolicyEntity {
    return new PolicyEntity({
      ...this.data,
      enabled: false,
      updatedAt: Date.now(),
    });
  }

  /**
   * Add rule to policy
   */
  addRule(rule: PolicyRule): PolicyEntity {
    return new PolicyEntity({
      ...this.data,
      rules: [...this.data.rules, rule],
      updatedAt: Date.now(),
    });
  }

  /**
   * Remove rule from policy
   */
  removeRule(index: number): PolicyEntity {
    return new PolicyEntity({
      ...this.data,
      rules: this.data.rules.filter((_, i) => i !== index),
      updatedAt: Date.now(),
    });
  }

  /**
   * Check if policy applies to resource and action
   */
  appliesTo(resource: string, action: string): boolean {
    return this.data.rules.some(
      rule => rule.resource === resource && rule.action === action
    );
  }

  /**
   * Get rule for resource and action
   */
  getRule(resource: string, action: string): PolicyRule | undefined {
    return this.data.rules.find(
      rule => rule.resource === resource && rule.action === action
    );
  }

  /**
   * Check if policy allows action on resource
   */
  isAllowed(resource: string, action: string): boolean {
    const rule = this.getRule(resource, action);
    if (!rule) return true;
    return rule.effect === 'allow';
  }

  /**
   * Check if policy denies action on resource
   */
  isDenied(resource: string, action: string): boolean {
    const rule = this.getRule(resource, action);
    if (!rule) return false;
    return rule.effect === 'deny';
  }

  /**
   * Clone the entity
   */
  clone(): PolicyEntity {
    return new PolicyEntity({
      ...this.data,
      rules: this.data.rules.map(rule => ({ ...rule })),
    });
  }

  /**
   * Convert to plain object
   */
  toObject(): PolicyData {
    return {
      ...this.data,
      rules: this.data.rules.map(rule => ({ ...rule })),
    };
  }

  /**
   * Check if two policies are equal
   */
  equals(other: PolicyEntity): boolean {
    return this.data.id === other.data.id;
  }
}
