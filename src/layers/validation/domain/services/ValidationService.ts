/**
 * Validation Service
 * 
 * Provides validation logic and rule management.
 */

import { ValidationRuleEntity } from '../entities/ValidationRuleEntity';
import { ValidationResultEntity } from '../entities/ValidationResultEntity';

export class ValidationService {
  private rules: Map<string, ValidationRuleEntity>;

  constructor() {
    this.rules = new Map();
  }

  /**
   * Add validation rule
   */
  addRule(rule: ValidationRuleEntity): void {
    this.rules.set(rule.data.id, rule);
  }

  /**
   * Remove validation rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Get validation rule
   */
  getRule(ruleId: string): ValidationRuleEntity | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Validate data against all rules
   */
  validate(data: Record<string, any>): ValidationResultEntity {
    let result = ValidationResultEntity.success();

    for (const [field, value] of Object.entries(data)) {
      const fieldRules = this.getRulesForField(field);
      for (const rule of fieldRules) {
        const validation = rule.validate(value);
        if (!validation.valid) {
          result = result.addError(field, validation.error || 'Validation failed');
        }
      }
    }

    return result;
  }

  /**
   * Validate specific field
   */
  validateField(field: string, value: any): ValidationResultEntity {
    let result = ValidationResultEntity.success();
    const fieldRules = this.getRulesForField(field);

    for (const rule of fieldRules) {
      const validation = rule.validate(value);
      if (!validation.valid) {
        result = result.addError(field, validation.error || 'Validation failed');
      }
    }

    return result;
  }

  /**
   * Get rules for specific field
   */
  private getRulesForField(field: string): ValidationRuleEntity[] {
    return Array.from(this.rules.values()).filter(rule => rule.data.name === field);
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules.clear();
  }

  /**
   * Get all rules
   */
  getAllRules(): ValidationRuleEntity[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rule count
   */
  getRuleCount(): number {
    return this.rules.size;
  }
}
