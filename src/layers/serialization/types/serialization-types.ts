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
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Serialization configuration
 */
export interface SerializationConfig {
  defaultFormat: SerializationFormat;
  enableVersioning: boolean;
  currentVersion: string;
  enableValidation: boolean;
  enablePlugins: boolean;
  enableHooks: boolean;
  strictMode: boolean;
  maxDataSize?: number;
  timeout?: number;
}

/**
 * Serialization options
 */
export interface SerializationOptions {
  format?: SerializationFormat;
  validate?: boolean;
  skipPlugins?: boolean;
  skipHooks?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Extended serialization result with versioning info
 */
export interface ExtendedSerializationResult extends SerializationResult {
  version?: string;
  validationErrors?: string[];
  validationWarnings?: string[];
}
