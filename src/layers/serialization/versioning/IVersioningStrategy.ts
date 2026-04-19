/**
 * Versioning Strategy Interface
 * 
 * Defines the contract for versioning strategies.
 */

export interface IVersioningStrategy {
  /**
   * Applies versioning to serialized data
   * 
   * @param data - Serialized data
   * @param version - Version string
   * @returns Versioned data
   */
  applyVersioning(data: string, version: string): string;

  /**
   * Extracts version from versioned data
   * 
   * @param data - Versioned data
   * @returns Object with version and data
   */
  extractVersion(data: string): { version: string; data: string } | null;

  /**
   * Gets the strategy name
   * 
   * @returns Strategy name
   */
  getStrategyName(): string;

  /**
   * Validates if data is versioned by this strategy
   * 
   * @param data - Data to validate
   * @returns True if data is versioned by this strategy
   */
  isVersioned(data: string): boolean;
}
