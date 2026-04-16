/**
 * Pagination Engine Implementation
 * 
 * Concrete implementation of IPaginationEngine.
 * Handles applying pagination to data collections.
 */

import { IPaginationEngine } from '../interfaces/IPaginationEngine';
import { ParsedPagination } from '../../query-parser/types/query-parser-types';
import {
  PaginationResult,
  PaginationMetadata,
  PaginationConfig,
  CursorInfo,
  PageInfo,
  PaginationStats,
} from '../types/pagination-engine-types';

export class PaginationEngine<T = unknown> implements IPaginationEngine<T> {
  private _config: PaginationConfig;
  private _stats: PaginationStats;

  constructor(config?: Partial<PaginationConfig>) {
    this._config = {
      defaultLimit: 10,
      maxLimit: 100,
      enableCursorPagination: true,
      enableOffsetPagination: true,
      ...config,
    };
    this._stats = {
      totalPaginations: 0,
      averagePageSize: 0,
      averageExecutionTime: 0,
    };
  }

  apply(data: T[], pagination: ParsedPagination, total?: number): PaginationResult<T> {
    const startTime = Date.now();

    try {
      const effectiveTotal = total ?? data.length;
      const effectiveLimit = Math.min(pagination.limit, this._config.maxLimit);
      const effectiveOffset = pagination.offset || 0;

      const paginatedData = data.slice(effectiveOffset, effectiveOffset + effectiveLimit);
      const metadata = this.getMetadata(effectiveTotal, effectiveLimit, effectiveOffset);

      this._stats.totalPaginations++;
      this._updateAveragePageSize(effectiveLimit);
      this._updateAverageExecutionTime(Date.now() - startTime);

      return {
        success: true,
        data: paginatedData,
        pagination: metadata,
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        pagination: {
          total: total ?? 0,
          limit: pagination.limit,
          offset: pagination.offset,
          currentPage: 1,
          totalPages: 0,
          hasNext: false,
          hasPrevious: false,
        },
        error: {
          code: 'PAGINATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown pagination error',
        },
      };
    }
  }

  applyOffset(data: T[], offset: number, limit: number, total?: number): PaginationResult<T> {
    const pagination: ParsedPagination = {
      limit: Math.min(limit, this._config.maxLimit),
      offset: Math.max(0, offset),
    };

    return this.apply(data, pagination, total);
  }

  applyCursor(
    data: T[],
    cursor: string | undefined,
    limit: number,
    direction: 'FORWARD' | 'BACKWARD'
  ): PaginationResult<T> {
    const startTime = Date.now();

    try {
      if (!this._config.enableCursorPagination) {
        throw new Error('Cursor pagination is disabled');
      }

      const effectiveLimit = Math.min(limit, this._config.maxLimit);
      let startIndex = 0;

      if (cursor) {
        const cursorInfo = this.parseCursor(cursor);
        startIndex = this._findCursorIndex(data, cursorInfo);
      }

      if (direction === 'BACKWARD' && cursor) {
        startIndex = Math.max(0, startIndex - effectiveLimit);
      }

      const paginatedData = data.slice(startIndex, startIndex + effectiveLimit);
      const metadata: PaginationMetadata = {
        total: data.length,
        limit: effectiveLimit,
        offset: startIndex,
        currentPage: this.calculatePageNumber(startIndex, effectiveLimit),
        totalPages: this.calculateTotalPages(data.length, effectiveLimit),
        hasNext: startIndex + effectiveLimit < data.length,
        hasPrevious: startIndex > 0,
        nextCursor: paginatedData.length > 0 ? this.generateCursor(paginatedData[paginatedData.length - 1], 'id') : undefined,
        previousCursor: startIndex > 0 ? this.generateCursor(data[Math.max(0, startIndex - 1)], 'id') : undefined,
      };

      this._stats.totalPaginations++;
      this._updateAveragePageSize(effectiveLimit);
      this._updateAverageExecutionTime(Date.now() - startTime);

      return {
        success: true,
        data: paginatedData,
        pagination: metadata,
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        pagination: {
          total: data.length,
          limit: limit,
          offset: 0,
          currentPage: 1,
          totalPages: 0,
          hasNext: false,
          hasPrevious: false,
        },
        error: {
          code: 'PAGINATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown pagination error',
        },
      };
    }
  }

  generateCursor(item: T, field: string): string {
    const entity = item as Record<string, unknown>;
    const value = entity[field];
    const encoded = btoa(JSON.stringify({ field, value }));
    return encoded;
  }

  parseCursor(cursor: string): CursorInfo {
    try {
      const decoded = atob(cursor);
      const parsed = JSON.parse(decoded);
      return {
        value: parsed.value,
        field: parsed.field,
        direction: 'FORWARD',
      };
    } catch (error) {
      throw new Error('Invalid cursor format');
    }
  }

  getMetadata(total: number, limit: number, offset: number): PaginationMetadata {
    const currentPage = this.calculatePageNumber(offset, limit);
    const totalPages = this.calculateTotalPages(total, limit);

    return {
      total,
      limit,
      offset,
      currentPage,
      totalPages,
      hasNext: offset + limit < total,
      hasPrevious: offset > 0,
    };
  }

  getPageInfo(total: number, pageSize: number, pageNumber: number): PageInfo {
    const totalPages = this.calculateTotalPages(total, pageSize);

    return {
      number: pageNumber,
      size: pageSize,
      totalElements: total,
      totalPages,
      hasNext: pageNumber < totalPages,
      hasPrevious: pageNumber > 1,
    };
  }

  setConfig(config: Partial<PaginationConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): PaginationConfig {
    return { ...this._config };
  }

  getStats(): PaginationStats {
    return { ...this._stats };
  }

  resetStats(): void {
    this._stats = {
      totalPaginations: 0,
      averagePageSize: 0,
      averageExecutionTime: 0,
    };
  }

  validate(pagination: ParsedPagination): boolean {
    if (pagination.limit < 0) return false;
    if (pagination.offset < 0) return false;
    if (pagination.limit > this._config.maxLimit) return false;
    return true;
  }

  calculateTotalPages(total: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.ceil(total / limit);
  }

  calculateOffset(pageNumber: number, pageSize: number): number {
    return Math.max(0, (pageNumber - 1) * pageSize);
  }

  calculatePageNumber(offset: number, pageSize: number): number {
    if (pageSize <= 0) return 1;
    return Math.floor(offset / pageSize) + 1;
  }

  private _findCursorIndex(data: T[], cursorInfo: CursorInfo): number {
    for (let i = 0; i < data.length; i++) {
      const entity = data[i] as Record<string, unknown>;
      if (entity[cursorInfo.field] === cursorInfo.value) {
        return i;
      }
    }
    return 0;
  }

  private _updateAveragePageSize(pageSize: number): void {
    const total = this._stats.totalPaginations;
    if (total > 0) {
      this._stats.averagePageSize =
        (this._stats.averagePageSize * (total - 1) + pageSize) / total;
    }
  }

  private _updateAverageExecutionTime(duration: number): void {
    const total = this._stats.totalPaginations;
    if (total > 0) {
      this._stats.averageExecutionTime =
        (this._stats.averageExecutionTime * (total - 1) + duration) / total;
    }
  }
}
