import { SchemaRegistryConfig } from '../../types/schema-registry-types';

export const DEFAULT_SCHEMAREGISTRY_CONFIG: SchemaRegistryConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
