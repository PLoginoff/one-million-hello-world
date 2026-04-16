/**
 * Data Access Implementation
 * 
 * Concrete implementation of IDataAccess.
 * Handles raw data storage and retrieval without any business logic.
 */

import { DomainEntity } from '../../../../domain/types/domain-types';
import { IDataAccess } from '../interfaces/IDataAccess';
import {
  DataAccessResult,
  DataAccessConfig,
  StorageStats,
  IndexConfig,
  BulkOperationResult,
  DataSnapshot,
  DataAccessOperation,
  DataAccessError,
  DataEntryMetadata,
} from '../types/data-access-types';

export class DataAccess<T extends DomainEntity> implements IDataAccess<T> {
  private _data: Map<string, T>;
  private _metadata: Map<string, DataEntryMetadata>;
  private _config: DataAccessConfig;
  private _operationCounts: Map<DataAccessOperation, number>;
  private _indexes: Map<string, IndexConfig>;
  private _lastModified: Date;

  constructor() {
    this._data = new Map();
    this._metadata = new Map();
    this._config = {
      enablePersistence: false,
      enableIndexing: false,
      maxStorageSize: undefined,
      compressionEnabled: false,
    };
    this._operationCounts = new Map();
    this._indexes = new Map();
    this._lastModified = new Date();
    this._initializeOperationCounts();
  }

  async read(id: string): Promise<DataAccessResult<T>> {
    this._incrementOperationCount(DataAccessOperation.READ);
    const startTime = Date.now();

    try {
      const entity = this._data.get(id);

      if (!entity) {
        return {
          success: false,
          error: this._createError(
            DataAccessOperation.READ,
            'ENTITY_NOT_FOUND',
            `Entity with ID ${id} not found`
          ),
        };
      }

      return { success: true, data: entity };
    } catch (error) {
      return {
        success: false,
        error: this._createError(
          DataAccessOperation.READ,
          'READ_ERROR',
          error instanceof Error ? error.message : 'Unknown read error'
        ),
      };
    }
  }

  async write(entity: T): Promise<DataAccessResult<T>> {
    this._incrementOperationCount(DataAccessOperation.WRITE);
    const startTime = Date.now();

    try {
      if (this._config.maxStorageSize && this._data.size >= this._config.maxStorageSize) {
        return {
          success: false,
          error: this._createError(
            DataAccessOperation.WRITE,
            'STORAGE_FULL',
            'Maximum storage size reached'
          ),
        };
      }

      const metadata = this._createMetadata(entity);
      this._data.set(entity.id, entity);
      this._metadata.set(entity.id, metadata);
      this._lastModified = new Date();

      return { success: true, data: entity };
    } catch (error) {
      return {
        success: false,
        error: this._createError(
          DataAccessOperation.WRITE,
          'WRITE_ERROR',
          error instanceof Error ? error.message : 'Unknown write error'
        ),
      };
    }
  }

  async delete(id: string): Promise<DataAccessResult<void>> {
    this._incrementOperationCount(DataAccessOperation.DELETE);
    const startTime = Date.now();

    try {
      if (!this._data.has(id)) {
        return {
          success: false,
          error: this._createError(
            DataAccessOperation.DELETE,
            'ENTITY_NOT_FOUND',
            `Entity with ID ${id} not found`
          ),
        };
      }

      this._data.delete(id);
      this._metadata.delete(id);
      this._lastModified = new Date();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this._createError(
          DataAccessOperation.DELETE,
          'DELETE_ERROR',
          error instanceof Error ? error.message : 'Unknown delete error'
        ),
      };
    }
  }

  async exists(id: string): Promise<DataAccessResult<boolean>> {
    this._incrementOperationCount(DataAccessOperation.EXISTS);
    const startTime = Date.now();

    try {
      const exists = this._data.has(id);
      return { success: true, data: exists };
    } catch (error) {
      return {
        success: false,
        error: this._createError(
          DataAccessOperation.EXISTS,
          'EXISTS_ERROR',
          error instanceof Error ? error.message : 'Unknown exists error'
        ),
      };
    }
  }

  async count(): Promise<DataAccessResult<number>> {
    this._incrementOperationCount(DataAccessOperation.COUNT);
    const startTime = Date.now();

    try {
      const count = this._data.size;
      return { success: true, data: count };
    } catch (error) {
      return {
        success: false,
        error: this._createError(
          DataAccessOperation.COUNT,
          'COUNT_ERROR',
          error instanceof Error ? error.message : 'Unknown count error'
        ),
      };
    }
  }

  async readAll(): Promise<DataAccessResult<T[]>> {
    this._incrementOperationCount(DataAccessOperation.READ);
    const startTime = Date.now();

    try {
      const entities = Array.from(this._data.values());
      return { success: true, data: entities };
    } catch (error) {
      return {
        success: false,
        error: this._createError(
          DataAccessOperation.READ,
          'READ_ALL_ERROR',
          error instanceof Error ? error.message : 'Unknown read all error'
        ),
      };
    }
  }

  async clear(): Promise<DataAccessResult<void>> {
    this._incrementOperationCount(DataAccessOperation.CLEAR);
    const startTime = Date.now();

    try {
      this._data.clear();
      this._metadata.clear();
      this._lastModified = new Date();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this._createError(
          DataAccessOperation.CLEAR,
          'CLEAR_ERROR',
          error instanceof Error ? error.message : 'Unknown clear error'
        ),
      };
    }
  }

  async bulkWrite(entities: T[]): Promise<BulkOperationResult> {
    this._incrementOperationCount(DataAccessOperation.WRITE);
    const startTime = Date.now();

    const successful: T[] = [];
    const failed: Array<{ entity: T; error: DataAccessError }> = [];

    for (const entity of entities) {
      try {
        const result = await this.write(entity);
        if (result.success && result.data) {
          successful.push(result.data);
        } else {
          failed.push({ entity, error: result.error! });
        }
      } catch (error) {
        failed.push({
          entity,
          error: this._createError(
            DataAccessOperation.WRITE,
            'BULK_WRITE_ERROR',
            error instanceof Error ? error.message : 'Unknown bulk write error'
          ),
        });
      }
    }

    return {
      successful: successful.length,
      failed: failed.length,
      errors: failed.map((f) => f.error),
    };
  }

  async bulkDelete(ids: string[]): Promise<BulkOperationResult> {
    this._incrementOperationCount(DataAccessOperation.DELETE);
    const startTime = Date.now();

    const successful: string[] = [];
    const failed: Array<{ id: string; error: DataAccessError }> = [];

    for (const id of ids) {
      try {
        const result = await this.delete(id);
        if (result.success) {
          successful.push(id);
        } else {
          failed.push({ id, error: result.error! });
        }
      } catch (error) {
        failed.push({
          id,
          error: this._createError(
            DataAccessOperation.DELETE,
            'BULK_DELETE_ERROR',
            error instanceof Error ? error.message : 'Unknown bulk delete error'
          ),
        });
      }
    }

    return {
      successful: successful.length,
      failed: failed.length,
      errors: failed.map((f) => f.error),
    };
  }

  createSnapshot(): DataSnapshot<T> {
    return {
      timestamp: new Date(),
      data: new Map(this._data),
      metadata: new Map(this._metadata),
    };
  }

  async restoreSnapshot(snapshot: DataSnapshot<T>): Promise<DataAccessResult<void>> {
    try {
      this._data = new Map(snapshot.data);
      this._metadata = new Map(snapshot.metadata);
      this._lastModified = new Date();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this._createError(
          DataAccessOperation.WRITE,
          'SNAPSHOT_RESTORE_ERROR',
          error instanceof Error ? error.message : 'Unknown snapshot restore error'
        ),
      };
    }
  }

  getStats(): StorageStats {
    const operationCounts = new Map(this._operationCounts);
    const totalSize = this._calculateTotalSize();

    return {
      totalEntries: this._data.size,
      totalSize,
      lastModified: this._lastModified,
      operationCounts,
    };
  }

  setConfig(config: DataAccessConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): DataAccessConfig {
    return { ...this._config };
  }

  async createIndex(config: IndexConfig): Promise<DataAccessResult<void>> {
    if (!this._config.enableIndexing) {
      return {
        success: false,
        error: this._createError(
          DataAccessOperation.READ,
          'INDEXING_DISABLED',
          'Indexing is not enabled in configuration'
        ),
      };
    }

    try {
      this._indexes.set(config.field, config);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this._createError(
          DataAccessOperation.READ,
          'INDEX_CREATE_ERROR',
          error instanceof Error ? error.message : 'Unknown index create error'
        ),
      };
    }
  }

  async dropIndex(field: string): Promise<DataAccessResult<void>> {
    try {
      this._indexes.delete(field);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this._createError(
          DataAccessOperation.READ,
          'INDEX_DROP_ERROR',
          error instanceof Error ? error.message : 'Unknown index drop error'
        ),
      };
    }
  }

  getOperationCount(operation: DataAccessOperation): number {
    return this._operationCounts.get(operation) || 0;
  }

  resetOperationCounts(): void {
    this._initializeOperationCounts();
  }

  private _initializeOperationCounts(): void {
    Object.values(DataAccessOperation).forEach((operation) => {
      this._operationCounts.set(operation, 0);
    });
  }

  private _incrementOperationCount(operation: DataAccessOperation): void {
    const currentCount = this._operationCounts.get(operation) || 0;
    this._operationCounts.set(operation, currentCount + 1);
  }

  private _createError(
    operation: DataAccessOperation,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ): DataAccessError {
    return {
      code,
      message,
      operation,
      details,
    };
  }

  private _createMetadata(entity: T): DataEntryMetadata {
    const existing = this._metadata.get(entity.id);
    const version = existing ? existing.version + 1 : 1;

    return {
      createdAt: existing ? existing.createdAt : new Date(),
      updatedAt: new Date(),
      version,
      checksum: this._calculateChecksum(entity),
    };
  }

  private _calculateChecksum(entity: T): string {
    const str = JSON.stringify(entity);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private _calculateTotalSize(): number {
    let totalSize = 0;
    for (const [key, value] of this._data) {
      totalSize += key.length + JSON.stringify(value).length;
    }
    return totalSize;
  }
}
