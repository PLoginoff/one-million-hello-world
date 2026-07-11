/**
 * Authorization Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Authorization Layer (Layer 37 of the architecture).
 */

export { IAuthorization } from './interfaces/IAuthorization';
export { Authorization } from './implementations/Authorization';
export * from './types/authorization-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
