/**
 * Data Transformation Layer Types
 * 
 * This module defines all type definitions for the Data Transformation Layer,
 * including normalization, enrichment, and mapping.
 */

/**
 * Transformation rule
 */
export interface TransformationRule {
  sourceField: string;
  targetField: string;
  transform?: (value: unknown) => unknown;
}

/**
 * Enrichment data
 */
export interface EnrichmentData {
  source: string;
  data: Record<string, unknown>;
}

/**
 * Transformation result
 */
export interface TransformationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Transformation configuration
 */
export interface TransformationConfig {
  enableNormalization: boolean;
  enableEnrichment: boolean;
  enableMapping: boolean;
}
