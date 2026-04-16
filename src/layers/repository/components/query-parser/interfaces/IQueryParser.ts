/**
 * Query Parser Interface
 * 
 * Defines the contract for parsing and validating query expressions.
 */

import {
  ParseResult,
  ParsedQuery,
  ParserConfig,
} from '../types/query-parser-types';

/**
 * Interface for query parsing operations
 */
export interface IQueryParser {
  /**
   * Parses a query string into a parsed query
   * 
   * @param query - Query string to parse
   * @returns Parse result with parsed query
   */
  parse(query: string): ParseResult;

  /**
   * Parses a filter expression
   * 
   * @param expression - Filter expression
   * @returns Parse result with parsed filter
   */
  parseFilter(expression: string): ParseResult;

  /**
   * Parses a sort expression
   * 
   * @param expression - Sort expression
   * @returns Parse result with parsed sort
   */
  parseSort(expression: string): ParseResult;

  /**
   * Parses a pagination expression
   * 
   * @param expression - Pagination expression
   * @returns Parse result with parsed pagination
   */
  parsePagination(expression: string): ParseResult;

  /**
   * Parses an aggregation expression
   * 
   * @param expression - Aggregation expression
   * @returns Parse result with parsed aggregation
   */
  parseAggregation(expression: string): ParseResult;

  /**
   * Validates a parsed query
   * 
   * @param query - Parsed query to validate
   * @returns Parse result with validation errors if any
   */
  validate(query: ParsedQuery): ParseResult;

  /**
   * Serializes a parsed query to a string
   * 
   * @param query - Parsed query to serialize
   * @returns Serialized query string
   */
  serialize(query: ParsedQuery): string;

  /**
   * Sets parser configuration
   * 
   * @param config - Parser configuration
   */
  setConfig(config: Partial<ParserConfig>): void;

  /**
   * Gets current parser configuration
   * 
   * @returns Current parser configuration
   */
  getConfig(): ParserConfig;

  /**
   * Adds an allowed field
   * 
   * @param field - Field name
   */
  addAllowedField(field: string): void;

  /**
   * Removes an allowed field
   * 
   * @param field - Field name
   */
  removeAllowedField(field: string): void;

  /**
   * Adds a forbidden field
   * 
   * @param field - Field name
   */
  addForbiddenField(field: string): void;

  /**
   * Removes a forbidden field
   * 
   * @param field - Field name
   */
  removeForbiddenField(field: string): void;

  /**
   * Gets all allowed fields
   * 
   * @returns Array of allowed field names
   */
  getAllowedFields(): string[];

  /**
   * Gets all forbidden fields
   * 
   * @returns Array of forbidden field names
   */
  getForbiddenFields(): string[];

  /**
   * Resets parser configuration to defaults
   */
  resetConfig(): void;

  /**
   * Gets parser statistics
   * 
   * @returns Parser statistics
   */
  getStats(): {
    totalParses: number;
    successfulParses: number;
    failedParses: number;
    averageParseTime: number;
  };
}
