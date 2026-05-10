/**
 * Validation Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Validation Layer (Layer 23 of the 25-layer architecture).
 *
 * The Validation Layer provides data validation with multiple strategies
 * and Clean Architecture.
 *
 * @module ValidationLayer
 */

// Legacy exports (backward compatibility)
export { IValidator } from './interfaces/IValidator';
export { Validator } from './implementations/Validator';
export * from './types/validation-types';

// New Clean Architecture exports
export { ValidationResultEntity as NewValidationResultEntity, ValidationError as NewValidationError, ValidationWarning as NewValidationWarning } from './domain/entities/ValidationResult';
export { ValidationMetadata, ValidationMetadataData } from './domain/value-objects/ValidationMetadata';
export { ValidationRule as NewValidationRule, ValidationRuleData as NewValidationRuleData, FieldType as NewFieldType, ValidationConstraint, ConstraintType, RuleSeverity, RuleValidationError, RuleValidationWarning } from './domain/value-objects/ValidationRule';
export { ValidationSchema as NewValidationSchema, ValidationSchemaData as NewValidationSchemaData } from './domain/value-objects/ValidationSchema';
export * from './strategies';
export * from './factories';
