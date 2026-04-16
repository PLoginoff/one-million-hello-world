/**
 * Storage Factory
 * 
 * Factory for creating storage instances.
 */

import { IStorage } from '../../storage/interfaces/IStorage';
import { InMemoryStorage } from '../../storage/implementations/in-memory/InMemoryStorage';
import { DistributedStorage } from '../../storage/implementations/distributed/DistributedStorage';

export type StorageType = 'IN_MEMORY' | 'DISTRIBUTED';

export class StorageFactory {
  /**
   * Create storage by type
   */
  static create<T>(type: StorageType = 'IN_MEMORY', options?: any): IStorage<T> {
    switch (type) {
      case 'IN_MEMORY':
        return new InMemoryStorage<T>();
      case 'DISTRIBUTED':
        return new DistributedStorage<T>(options?.nodeId);
      default:
        return new InMemoryStorage<T>();
    }
  }

  /**
   * Create in-memory storage
   */
  static createInMemory<T>(): IStorage<T> {
    return new InMemoryStorage<T>();
  }

  /**
   * Create distributed storage
   */
  static createDistributed<T>(nodeId?: string): IStorage<T> {
    return new DistributedStorage<T>(nodeId);
  }

  /**
   * Get available storage types
   */
  static getAvailableTypes(): StorageType[] {
    return ['IN_MEMORY', 'DISTRIBUTED'];
  }
}
