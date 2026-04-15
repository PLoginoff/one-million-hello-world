/**
 * Saga Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Saga Layer (Layer 20 of the 25-layer architecture).
 * 
 * The Saga Layer provides distributed transactions
 * and compensation.
 * 
 * @module SagaLayer
 */

export { ISagaManager } from './interfaces/ISagaManager';
export { SagaManager } from './implementations/SagaManager';
export * from './types/saga-types';
