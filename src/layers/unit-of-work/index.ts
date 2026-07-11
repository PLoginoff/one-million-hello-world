/**
 * UnitOfWork Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the UnitOfWork Layer (Layer 65 of the architecture).
 */

export { IUnitOfWork } from './interfaces/IUnitOfWork';
export { UnitOfWork } from './implementations/UnitOfWork';
export * from './types/unit-of-work-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
