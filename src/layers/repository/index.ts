/**
 * Repository Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Repository Layer (Layer 11 of the 25-layer architecture).
 * 
 * The Repository Layer provides data access abstraction
 * and query builders.
 * 
 * @module RepositoryLayer
 */

export { IRepository } from './interfaces/IRepository';
export { Repository } from './implementations/Repository';
export * from './types/repository-types';
