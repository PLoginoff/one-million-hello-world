/**
 * ApiGatewayStrategyFactory
 *
 * Factory for creating ApiGateway strategies by name.
 */

import { ApiGatewayDefaultStrategy } from '../strategies/DefaultStrategy';
import { ApiGatewayFastStrategy } from '../strategies/FastStrategy';
import { ApiGatewayReliableStrategy } from '../strategies/ReliableStrategy';
import { ApiGatewayCachedStrategy } from '../strategies/CachedStrategy';
import { ApiGatewayBatchStrategy } from '../strategies/BatchStrategy';

export interface IApiGatewayStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ApiGatewayStrategyFactory {
  private _strategies: Map<string, () => IApiGatewayStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ApiGatewayDefaultStrategy());
    this._strategies.set('fast', () => new ApiGatewayFastStrategy());
    this._strategies.set('reliable', () => new ApiGatewayReliableStrategy());
    this._strategies.set('cached', () => new ApiGatewayCachedStrategy());
    this._strategies.set('batch', () => new ApiGatewayBatchStrategy());
  }

  create(name: string): IApiGatewayStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown api-gateway strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IApiGatewayStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IApiGatewayStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IApiGatewayStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IApiGatewayStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
