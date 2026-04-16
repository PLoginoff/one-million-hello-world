/**
 * Query Parser Layer Types
 * 
 * Type definitions for parsing and validating query expressions.
 */

/**
 * Parsed query expression
 */
export interface ParsedQuery {
  filters: ParsedFilter[];
  sorts: ParsedSort[];
  pagination: ParsedPagination;
  projections: string[];
  groups: ParsedGroup[];
  aggregations: ParsedAggregation[];
}

/**
 * Parsed filter
 */
export interface ParsedFilter {
  field: string;
  operator: FilterOperator;
  value: unknown;
  negated: boolean;
  logicalOperator: LogicalOperator;
}

/**
 * Parsed sort
 */
export interface ParsedSort {
  field: string;
  direction: SortDirection;
  nullPosition: NullPosition;
}

/**
 * Parsed pagination
 */
export interface ParsedPagination {
  limit: number;
  offset: number;
  cursor?: string;
}

/**
 * Parsed group
 */
export interface ParsedGroup {
  field: string;
  aggregations: ParsedAggregation[];
}

/**
 * Parsed aggregation
 */
export interface ParsedAggregation {
  function: AggregationFunction;
  field: string;
  alias?: string;
}

/**
 * Filter operator
 */
export enum FilterOperator {
  EQUALS = 'EQUALS',
  NOT_EQUALS = 'NOT_EQUALS',
  CONTAINS = 'CONTAINS',
  STARTS_WITH = 'STARTS_WITH',
  ENDS_WITH = 'ENDS_WITH',
  GREATER_THAN = 'GREATER_THAN',
  LESS_THAN = 'LESS_THAN',
  GREATER_THAN_OR_EQUALS = 'GREATER_THAN_OR_EQUALS',
  LESS_THAN_OR_EQUALS = 'LESS_THAN_OR_EQUALS',
  IN = 'IN',
  NOT_IN = 'NOT_IN',
  BETWEEN = 'BETWEEN',
  IS_NULL = 'IS_NULL',
  IS_NOT_NULL = 'IS_NOT_NULL',
  LIKE = 'LIKE',
  REGEX = 'REGEX',
}

/**
 * Logical operator
 */
export enum LogicalOperator {
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
}

/**
 * Sort direction
 */
export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * Null position
 */
export enum NullPosition {
  FIRST = 'FIRST',
  LAST = 'LAST',
}

/**
 * Aggregation function
 */
export enum AggregationFunction {
  COUNT = 'COUNT',
  SUM = 'SUM',
  AVG = 'AVG',
  MIN = 'MIN',
  MAX = 'MAX',
}

/**
 * Parser configuration
 */
export interface ParserConfig {
  enableValidation: boolean;
  maxDepth: number;
  maxComplexity: number;
  allowedFields: string[];
  forbiddenFields: string[];
}

/**
 * Parse result
 */
export interface ParseResult {
  success: boolean;
  query?: ParsedQuery;
  errors: ParseError[];
  warnings: ParseWarning[];
}

/**
 * Parse error
 */
export interface ParseError {
  code: string;
  message: string;
  position: number;
  severity: ErrorSeverity;
}

/**
 * Parse warning
 */
export interface ParseWarning {
  code: string;
  message: string;
  position: number;
}

/**
 * Error severity
 */
export enum ErrorSeverity {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO',
}
