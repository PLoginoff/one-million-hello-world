/**
 * Domain Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Domain Layer (Layer 10 of the 25-layer architecture).
 * 
 * The Domain Layer provides core entities, value objects,
 * and domain events.
 * 
 * @module DomainLayer
 */

export { IDomainManager } from './interfaces/IDomainManager';
export { DomainManager } from './implementations/DomainManager';
export * from './types/domain-types';
