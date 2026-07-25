/**
 * OnboardingStrategyFactory
 *
 * Factory for creating Onboarding strategies by name.
 */

import { OnboardingDefaultStrategy } from '../strategies/DefaultStrategy';
import { OnboardingFastStrategy } from '../strategies/FastStrategy';
import { OnboardingReliableStrategy } from '../strategies/ReliableStrategy';
import { OnboardingCachedStrategy } from '../strategies/CachedStrategy';
import { OnboardingBatchStrategy } from '../strategies/BatchStrategy';

export interface IOnboardingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class OnboardingStrategyFactory {
  private _strategies: Map<string, () => IOnboardingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new OnboardingDefaultStrategy());
    this._strategies.set('fast', () => new OnboardingFastStrategy());
    this._strategies.set('reliable', () => new OnboardingReliableStrategy());
    this._strategies.set('cached', () => new OnboardingCachedStrategy());
    this._strategies.set('batch', () => new OnboardingBatchStrategy());
  }

  create(name: string): IOnboardingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown onboarding strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IOnboardingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IOnboardingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IOnboardingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IOnboardingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
