/**
 * ServiceMeshStrategyFactory
 *
 * Factory for creating ServiceMesh strategies by name.
 */

import { ServiceMeshDefaultStrategy } from '../strategies/DefaultStrategy';
import { ServiceMeshFastStrategy } from '../strategies/FastStrategy';
import { ServiceMeshReliableStrategy } from '../strategies/ReliableStrategy';
import { ServiceMeshCachedStrategy } from '../strategies/CachedStrategy';
import { ServiceMeshBatchStrategy } from '../strategies/BatchStrategy';

export interface IServiceMeshStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ServiceMeshStrategyFactory {
  private _strategies: Map<string, () => IServiceMeshStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ServiceMeshDefaultStrategy());
    this._strategies.set('fast', () => new ServiceMeshFastStrategy());
    this._strategies.set('reliable', () => new ServiceMeshReliableStrategy());
    this._strategies.set('cached', () => new ServiceMeshCachedStrategy());
    this._strategies.set('batch', () => new ServiceMeshBatchStrategy());
  }

  create(name: string): IServiceMeshStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown service-mesh strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IServiceMeshStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IServiceMeshStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IServiceMeshStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IServiceMeshStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
