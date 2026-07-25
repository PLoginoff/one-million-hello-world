/**
 * WorkflowEngineStrategyFactory
 *
 * Factory for creating WorkflowEngine strategies by name.
 */

import { WorkflowEngineDefaultStrategy } from '../strategies/DefaultStrategy';
import { WorkflowEngineFastStrategy } from '../strategies/FastStrategy';
import { WorkflowEngineReliableStrategy } from '../strategies/ReliableStrategy';
import { WorkflowEngineCachedStrategy } from '../strategies/CachedStrategy';
import { WorkflowEngineBatchStrategy } from '../strategies/BatchStrategy';

export interface IWorkflowEngineStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class WorkflowEngineStrategyFactory {
  private _strategies: Map<string, () => IWorkflowEngineStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new WorkflowEngineDefaultStrategy());
    this._strategies.set('fast', () => new WorkflowEngineFastStrategy());
    this._strategies.set('reliable', () => new WorkflowEngineReliableStrategy());
    this._strategies.set('cached', () => new WorkflowEngineCachedStrategy());
    this._strategies.set('batch', () => new WorkflowEngineBatchStrategy());
  }

  create(name: string): IWorkflowEngineStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown workflow-engine strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IWorkflowEngineStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IWorkflowEngineStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IWorkflowEngineStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IWorkflowEngineStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
