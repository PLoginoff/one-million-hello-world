/**
 * Strategy Manager Implementation
 * 
 * Concrete implementation of IStrategyManager.
 * Handles execution strategies, A/B testing, and feature flags.
 */

import { IStrategyManager } from '../interfaces/IStrategyManager';
import {
  StrategyType,
  FeatureFlag,
  StrategyResult,
  StrategyConfig,
} from '../types/strategy-types';

export class StrategyManager implements IStrategyManager {
  private _config: StrategyConfig;
  private _flags: Map<string, FeatureFlag>;

  constructor() {
    this._config = {
      defaultStrategy: StrategyType.DEFAULT,
      enableABTesting: false,
      enableFeatureFlags: false,
    };
    this._flags = new Map();
  }

  async execute<T>(operation: () => T | Promise<T>, strategy?: StrategyType): Promise<StrategyResult<T>> {
    const selectedStrategy = strategy ?? this._config.defaultStrategy;
    const enabledFlags = this._getEnabledFlags();

    try {
      const result = await operation();
      return {
        success: true,
        data: result,
        strategy: selectedStrategy,
        flags: enabledFlags,
      };
    } catch (error) {
      return {
        success: false,
        strategy: selectedStrategy,
        flags: enabledFlags,
      };
    }
  }

  registerFlag(flag: FeatureFlag): void {
    this._flags.set(flag.name, flag);
  }

  isFlagEnabled(flagName: string): boolean {
    if (!this._config.enableFeatureFlags) {
      return false;
    }

    const flag = this._flags.get(flagName);
    if (!flag || !flag.enabled) {
      return false;
    }

    const random = Math.random() * 100;
    return random < flag.percentage;
  }

  setConfig(config: StrategyConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): StrategyConfig {
    return { ...this._config };
  }

  private _getEnabledFlags(): string[] {
    if (!this._config.enableFeatureFlags) {
      return [];
    }

    const enabled: string[] = [];
    for (const [name, flag] of this._flags.entries()) {
      if (flag.enabled && this.isFlagEnabled(name)) {
        enabled.push(name);
      }
    }
    return enabled;
  }
}
