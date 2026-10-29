/**
 * WriteModel Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the WriteModel Layer (Layer 54 of the architecture).
 */

export { IWriteModel } from './interfaces/IWriteModel';
export { WriteModel } from './implementations/WriteModel';
export * from './implementations/AggregateRoot';
export * from './implementations/EventStorage';
export * from './implementations/AggregateRepository';
export * from './implementations/CommandRouter';
export * from './implementations/InvariantRegistry';
export * from './types/write-model-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
