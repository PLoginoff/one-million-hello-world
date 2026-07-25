/**
 * BpmnStrategyFactory
 *
 * Factory for creating Bpmn strategies by name.
 */

import { BpmnDefaultStrategy } from '../strategies/DefaultStrategy';
import { BpmnFastStrategy } from '../strategies/FastStrategy';
import { BpmnReliableStrategy } from '../strategies/ReliableStrategy';
import { BpmnCachedStrategy } from '../strategies/CachedStrategy';
import { BpmnBatchStrategy } from '../strategies/BatchStrategy';

export interface IBpmnStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class BpmnStrategyFactory {
  private _strategies: Map<string, () => IBpmnStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new BpmnDefaultStrategy());
    this._strategies.set('fast', () => new BpmnFastStrategy());
    this._strategies.set('reliable', () => new BpmnReliableStrategy());
    this._strategies.set('cached', () => new BpmnCachedStrategy());
    this._strategies.set('batch', () => new BpmnBatchStrategy());
  }

  create(name: string): IBpmnStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown bpmn strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IBpmnStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IBpmnStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IBpmnStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IBpmnStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
