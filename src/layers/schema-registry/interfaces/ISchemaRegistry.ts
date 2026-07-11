/**
 * SchemaRegistry Interface
 *
 * Defines the contract for the Schema registry and contract validation layer.
 */

import { SchemaRegistryResult, SchemaRegistryContext } from '../types/schema-registry-types';

export interface ISchemaRegistry {
  /**
   * Execute the schemaRegistry operation
   */
  execute(context: SchemaRegistryContext): Promise<SchemaRegistryResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
