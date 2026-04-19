/**
 * EventValidator - Utility
 * 
 * Validates event structure and content.
 * Provides schema validation and business rule enforcement.
 */

import { Event } from '../domain/entities/Event';
import { EventType } from '../domain/value-objects/EventType';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationRule {
  name: string;
  validate: (event: Event) => boolean;
  errorMessage: string;
}

export class EventValidator {
  private _rules: ValidationRule[];

  constructor() {
    this._rules = [];
    this._addDefaultRules();
  }

  addRule(rule: ValidationRule): void {
    this._rules.push(rule);
  }

  removeRule(ruleName: string): boolean {
    const index = this._rules.findIndex(r => r.name === ruleName);
    if (index !== -1) {
      this._rules.splice(index, 1);
      return true;
    }
    return false;
  }

  validate(event: Event): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of this._rules) {
      if (!rule.validate(event)) {
        errors.push(rule.errorMessage);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateBatch(events: Event[]): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const event of events) {
      const result = this.validate(event);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  private _addDefaultRules(): void {
    this._rules.push({
      name: 'id-required',
      validate: (event) => event.id !== undefined && event.id.value.length > 0,
      errorMessage: 'Event must have a valid ID',
    });

    this._rules.push({
      name: 'type-required',
      validate: (event) => event.type !== undefined && event.type.value.length > 0,
      errorMessage: 'Event must have a valid type',
    });

    this._rules.push({
      name: 'payload-required',
      validate: (event) => event.payload !== undefined,
      errorMessage: 'Event must have a payload',
    });

    this._rules.push({
      name: 'timestamp-required',
      validate: (event) => event.occurredAt !== undefined && !isNaN(event.occurredAt.getTime()),
      errorMessage: 'Event must have a valid timestamp',
    });

    this._rules.push({
      name: 'metadata-required',
      validate: (event) => event.metadata !== undefined,
      errorMessage: 'Event must have metadata',
    });

    this._rules.push({
      name: 'correlation-id-required',
      validate: (event) => event.metadata.correlationId !== undefined && event.metadata.correlationId.length > 0,
      errorMessage: 'Event metadata must have a correlation ID',
    });

    this._rules.push({
      name: 'future-timestamp-check',
      validate: (event) => event.occurredAt <= new Date(),
      errorMessage: 'Event timestamp cannot be in the future',
    });
  }
}
