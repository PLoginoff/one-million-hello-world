/**
 * Serialization Layer Types
 * 
 * This module defines all type definitions for the Serialization Layer,
 * including response serialization, versioning, and content negotiation.
 */

/**
 * Content type
 */
export enum ContentType {
  JSON = 'application/json',
  XML = 'application/xml',
  PLAIN_TEXT = 'text/plain',
  HTML = 'text/html',
}

/**
 * Serialization format
 */
export enum SerializationFormat {
  JSON = 'json',
  XML = 'xml',
  STRING = 'string',
}

/**
 * Serialization result
 */
export interface SerializationResult {
  success: boolean;
  data?: string;
  contentType?: ContentType;
  error?: string;
}

/**
 * Serialization configuration
 */
export interface SerializationConfig {
  defaultFormat: SerializationFormat;
  enableVersioning: boolean;
  currentVersion: string;
}
