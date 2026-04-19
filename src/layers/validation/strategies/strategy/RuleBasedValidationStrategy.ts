/**
 * Rule-Based Validation Strategy
 * 
 * Implements rule-based validation strategy.
 */

import { IValidationStrategy } from './IValidationStrategy';
import { ValidationResultEntity } from '../../domain/entities/ValidationResultEntity';
import { ValidationRuleEntity } from '../../domain/entities/ValidationRuleEntity';

export class RuleBasedValidationStrategy implements IValidationStrategy {
  private rules: Map<string, ValidationRuleEntity>;

  constructor() {
    this.rules = new Map();
  }

  getName(): string {
    return 'RULE_BASED_VALIDATION';
  }

  addRule(rule: ValidationRuleEntity): void {
    this.rules.set(rule.data.id, rule);
  }

  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  validate(value: any): ValidationResultEntity {
    let result = ValidationResultEntity.success();

    for (const [field, fieldRule] of this.rules.entries()) {
      const fieldValue = value[fieldRule.data.name];
      const validation = fieldRule.validate(fieldValue);
      
      if (!validation.valid) {
        result = result.addError(fieldRule.data.name, validation.error || 'Validation failed');
      }
    }

    return result;
  }

  /**
   * Get all rules
   */
  getRules(): ValidationRuleEntity[] {
    return Array.from(this.rules.values());
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules.clear();
  }
}
