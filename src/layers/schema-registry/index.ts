/**
 * SchemaRegistry Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the SchemaRegistry Layer (Layer 35 of the architecture).
 */

export { ISchemaRegistry } from './interfaces/ISchemaRegistry';
export { SchemaRegistry } from './implementations/SchemaRegistry';
export * from './types/schema-registry-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
export * from './registry';
