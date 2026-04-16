/**
 * Pagination Engine Interface
 * 
 * Defines the contract for applying pagination to data collections.
 */

import { ParsedPagination } from '../../query-parser/types/query-parser-types';
import {
  PaginationResult,
  PaginationMetadata,
  PaginationConfig,
  CursorInfo,
  PageInfo,
  PaginationStats,
} from '../types/pagination-engine-types';

/**
 * Interface for pagination engine operations
 */
export interface IPaginationEngine<T = unknown> {
  /**
   * Applies pagination to data
   * 
   * @param data - Data to paginate
   * @param pagination - Parsed pagination
   * @param total - Total number of items (if known)
   * @returns Pagination result with paginated data
   */
  apply(data: T[], pagination: ParsedPagination, total?: number): PaginationResult<T>;

  /**
   * Applies offset-based pagination
   * 
   * @param data - Data to paginate
   * @param offset - Number of items to skip
   * @param limit - Maximum number of items to return
   * @param total - Total number of items (if known)
   * @returns Pagination result with paginated data
   */
  applyOffset(data: T[], offset: number, limit: number, total?: number): PaginationResult<T>;

  /**
   * Applies cursor-based pagination
   * 
   * @param data - Data to paginate
   * @param cursor - Cursor for pagination
   * @param limit - Maximum number of items to return
   * @param direction - Pagination direction
   * @returns Pagination result with paginated data
   */
  applyCursor(
    data: T[],
    cursor: string | undefined,
    limit: number,
    direction: 'FORWARD' | 'BACKWARD'
  ): PaginationResult<T>;

  /**
   * Generates a cursor for an item
   * 
   * @param item - Item to generate cursor for
   * @param field - Field to use for cursor
   * @returns Cursor string
   */
  generateCursor(item: T, field: string): string;

  /**
   * Parses a cursor
   * 
   * @param cursor - Cursor string to parse
   * @returns Cursor information
   */
  parseCursor(cursor: string): CursorInfo;

  /**
   * Gets pagination metadata
   * 
   * @param total - Total number of items
   * @param limit - Page size
   * @param offset - Offset
   * @returns Pagination metadata
   */
  getMetadata(total: number, limit: number, offset: number): PaginationMetadata;

  /**
   * Gets page information
   * 
   * @param total - Total number of items
   * @param pageSize - Page size
   * @param pageNumber - Page number (1-based)
   * @returns Page information
   */
  getPageInfo(total: number, pageSize: number, pageNumber: number): PageInfo;

  /**
   * Sets pagination configuration
   * 
   * @param config - Pagination configuration
   */
  setConfig(config: Partial<PaginationConfig>): void;

  /**
   * Gets current pagination configuration
   * 
   * @returns Current pagination configuration
   */
  getConfig(): PaginationConfig;

  /**
   * Gets pagination statistics
   * 
   * @returns Pagination statistics
   */
  getStats(): PaginationStats;

  /**
   * Resets pagination statistics
   */
  resetStats(): void;

  /**
   * Validates pagination parameters
   * 
   * @param pagination - Parsed pagination to validate
   * @returns Boolean indicating if pagination is valid
   */
  validate(pagination: ParsedPagination): boolean;

  /**
   * Calculates total pages
   * 
   * @param total - Total number of items
   * @param limit - Page size
   * @returns Total number of pages
   */
  calculateTotalPages(total: number, limit: number): number;

  /**
   * Calculates offset from page number
   * 
   * @param pageNumber - Page number (1-based)
   * @param pageSize - Page size
   * @returns Offset
   */
  calculateOffset(pageNumber: number, pageSize: number): number;

  /**
   * Calculates page number from offset
   * 
   * @param offset - Offset
   * @param pageSize - Page size
   * @returns Page number (1-based)
   */
  calculatePageNumber(offset: number, pageSize: number): number;
}
