/**
 * MessageQueueStrategyFactory
 *
 * Factory for creating MessageQueue strategies by name with profile support.
 */

import { MessageQueueDefaultStrategy } from '../strategies/DefaultStrategy';
import { MessageQueueFastStrategy } from '../strategies/FastStrategy';
import { MessageQueueReliableStrategy } from '../strategies/ReliableStrategy';
import { MessageQueueCachedStrategy } from '../strategies/CachedStrategy';
import { MessageQueueBatchStrategy } from '../strategies/BatchStrategy';
import { IMessageQueueStrategy } from '../strategies/DefaultStrategy';
import { MessageQueueProfile, RetryPolicy } from '../types/message-queue-types';

export interface MessageQueueFactoryOptions {
  profile?: MessageQueueProfile;
  retryPolicy?: Partial<RetryPolicy>;
  cacheTtl?: number;
  cacheMaxSize?: number;
  batchSize?: number;
  batchTimeout?: number;
}

export class MessageQueueStrategyFactory {
  private _strategies: Map<string, (options?: MessageQueueFactoryOptions) => IMessageQueueStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', (options) => new MessageQueueDefaultStrategy());
    this._strategies.set('fast', (options) => new MessageQueueFastStrategy());
    this._strategies.set('reliable', (options) => new MessageQueueReliableStrategy(options?.retryPolicy));
    this._strategies.set('cached', (options) => new MessageQueueCachedStrategy(options?.cacheTtl, options?.cacheMaxSize));
    this._strategies.set('batch', (options) => new MessageQueueBatchStrategy(options?.batchSize, options?.batchTimeout));
  }

  create(name: string, options?: MessageQueueFactoryOptions): IMessageQueueStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown message-queue strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory(options);
  }

  createDefault(options?: MessageQueueFactoryOptions): IMessageQueueStrategy {
    return this.create('default', options);
  }

  createForProfile(profile: MessageQueueProfile, options?: MessageQueueFactoryOptions): IMessageQueueStrategy {
    const profileOptions = this._getProfileOptions(profile);
    const mergedOptions = { ...profileOptions, ...options };
    const strategyName = this._getStrategyForProfile(profile);
    return this.create(strategyName, mergedOptions);
  }

  registerStrategy(name: string, factory: (options?: MessageQueueFactoryOptions) => IMessageQueueStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(options?: MessageQueueFactoryOptions): IMessageQueueStrategy[] {
    return Array.from(this._strategies.values()).map((f) => f(options));
  }

  createByPriority(options?: MessageQueueFactoryOptions): IMessageQueueStrategy[] {
    return this.createAll(options).sort((a, b) => b.priority - a.priority);
  }

  private _getProfileOptions(profile: MessageQueueProfile): MessageQueueFactoryOptions {
    switch (profile) {
      case 'development':
        return {
          retryPolicy: { maxAttempts: 1, baseDelayMs: 100 },
          cacheTtl: 10000,
          cacheMaxSize: 100,
          batchSize: 10,
          batchTimeout: 100,
        };
      case 'staging':
        return {
          retryPolicy: { maxAttempts: 2, baseDelayMs: 500 },
          cacheTtl: 30000,
          cacheMaxSize: 500,
          batchSize: 50,
          batchTimeout: 500,
        };
      case 'production':
        return {
          retryPolicy: { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 30000 },
          cacheTtl: 60000,
          cacheMaxSize: 1000,
          batchSize: 100,
          batchTimeout: 1000,
        };
      case 'test':
        return {
          retryPolicy: { maxAttempts: 0, baseDelayMs: 0 },
          cacheTtl: 1000,
          cacheMaxSize: 10,
          batchSize: 5,
          batchTimeout: 50,
        };
      default:
        return {};
    }
  }

  private _getStrategyForProfile(profile: MessageQueueProfile): string {
    switch (profile) {
      case 'development':
        return 'fast';
      case 'staging':
        return 'cached';
      case 'production':
        return 'reliable';
      case 'test':
        return 'default';
      default:
        return 'default';
    }
  }
}

/**
 * MessageQueueFactory - Higher level factory for creating complete message queue instances
 */
export class MessageQueueFactory {
  private readonly _strategyFactory: MessageQueueStrategyFactory;

  constructor() {
    this._strategyFactory = new MessageQueueStrategyFactory();
  }

  createQueue(options?: MessageQueueFactoryOptions): {
    strategy: IMessageQueueStrategy;
    config: Record<string, unknown>;
  } {
    const profile = options?.profile ?? 'development';
    const strategy = this._strategyFactory.createForProfile(profile, options);

    return {
      strategy,
      config: {
        profile,
        strategy: strategy.name,
        ...options,
      },
    };
  }

  getStrategyFactory(): MessageQueueStrategyFactory {
    return this._strategyFactory;
  }
}