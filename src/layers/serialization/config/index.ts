/**
 * Configuration Module
 * 
 * Exports configuration validation and loading utilities.
 */

export { ConfigSchema, SchemaDefinition, SchemaProperty, defaultSerializationConfigSchema } from './ConfigSchema';
export { ConfigValidator } from './ConfigValidator';
export { ConfigLoader, ConfigSource, ObjectConfigSource } from './ConfigLoader';
