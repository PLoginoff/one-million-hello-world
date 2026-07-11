/**
 * Storage Factory
 *
 * Factory for creating storage instances.
 */

import { IStorage } from '../../storage/interfaces/IStorage';
import { InMemoryStorage } from '../../storage/implementations/in-memory/InMemoryStorage';
import { DistributedStorage } from '../../storage/implementations/distributed/DistributedStorage';

export enum StorageType {
  IN_MEMORY = 'IN_MEMORY',
  DISTRIBUTED = 'DISTRIBUTED',
}

export class StorageFactory {
  /**
   * Create storage by type
   */
  static create<T>(type: StorageType = StorageType.IN_MEMORY, options?: any): IStorage<T> {
    switch (type) {
      case StorageType.IN_MEMORY:
        return new InMemoryStorage<T>();
      case StorageType.DISTRIBUTED:
        return new DistributedStorage<T>(options?.nodeId ?? options);
      default:
        throw new Error(`Unsupported storage type: ${type}`);
    }
  }

  /**
   * Create in-memory storage
   */
  static createInMemory<T>(_options?: any): IStorage<T> {
    return new InMemoryStorage<T>();
  }

  /**
   * Create distributed storage
   */
  static createDistributed<T>(nodeId?: string | { nodeId?: string; nodes?: string[] }): IStorage<T> {
    if (typeof nodeId === 'string') {
      return new DistributedStorage<T>(nodeId);
    }
    const id = nodeId?.nodeId ?? (nodeId?.nodes && nodeId.nodes.length > 0 ? nodeId.nodes[0] : undefined);
    return new DistributedStorage<T>(id);
  }

  /**
   * Get available storage types
   */
  static getAvailableTypes(): StorageType[] {
    return [StorageType.IN_MEMORY, StorageType.DISTRIBUTED];
  }

  /**
   * Get available storage types (alias for getAvailableTypes)
   */
  static getAvailableStorageTypes(): StorageType[] {
    return this.getAvailableTypes();
  }

  /**
   * Check if storage type is valid
   */
  static isValidStorageType(type: unknown): boolean {
    return this.getAvailableTypes().includes(type as StorageType);
  }
}
