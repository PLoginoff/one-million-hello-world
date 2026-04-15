/**
 * Data Transformer Interface
 * 
 * Defines the contract for data transformation operations
 * including normalization, enrichment, and mapping.
 */

import {
  TransformationRule,
  EnrichmentData,
  TransformationResult,
  TransformationConfig,
} from '../types/data-transformation-types';

/**
 * Interface for data transformation operations
 */
export interface IDataTransformer {
  /**
   * Normalizes data
   * 
   * @param data - Data to normalize
   * @returns Transformation result
   */
  normalize<T>(data: T): TransformationResult<T>;

  /**
   * Enriches data with additional information
   * 
   * @param data - Data to enrich
   * @param enrichment - Enrichment data
   * @returns Transformation result
   */
  enrich<T>(data: T, enrichment: EnrichmentData): TransformationResult<T>;

  /**
   * Maps data using transformation rules
   * 
   * @param data - Data to map
   * @param rules - Transformation rules
   * @returns Transformation result
   */
  map<T, U>(data: T, rules: TransformationRule[]): TransformationResult<U>;

  /**
   * Applies all transformations (normalize, enrich, map)
   * 
   * @param data - Data to transform
   * @param rules - Transformation rules
   * @param enrichment - Enrichment data
   * @returns Transformation result
   */
  transform<T, U>(
    data: T,
    rules?: TransformationRule[],
    enrichment?: EnrichmentData,
  ): TransformationResult<U>;

  /**
   * Sets transformation configuration
   * 
   * @param config - Transformation configuration
   */
  setConfig(config: TransformationConfig): void;

  /**
   * Gets current transformation configuration
   * 
   * @returns Current transformation configuration
   */
  getConfig(): TransformationConfig;
}
