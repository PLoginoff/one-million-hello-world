/**
 * Migrations Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Migrations Layer (Layer 40 of the architecture).
 */

export { IMigrations } from './interfaces/IMigrations';
export { Migrations } from './implementations/Migrations';
export * from './types/migrations-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
