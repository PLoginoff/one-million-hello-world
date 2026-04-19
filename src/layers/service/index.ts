/**
 * Service Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Service Layer (Layer 9 of the 25-layer architecture).
 * 
 * The Service Layer provides business logic, use cases,
 * and domain operations.
 * 
 * @module ServiceLayer
 */

export { IService } from './interfaces/IService';
export { Service } from './implementations/Service';
export * from './types/service-types';

export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './statistics';
export * from './factories';
export * from './utils';
