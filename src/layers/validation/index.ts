/**
 * Validation Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Validation Layer (Layer 5 of the 25-layer architecture).
 * 
 * The Validation Layer provides schema validation, sanitization,
 * and type checking for request data.
 * 
 * @module ValidationLayer
 */

export { IValidator } from './interfaces/IValidator';
export { Validator } from './implementations/Validator';
export * from './types/validation-types';

export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './statistics';
export * from './factories';
export * from './utils';
