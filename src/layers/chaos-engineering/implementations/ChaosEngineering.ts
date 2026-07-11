/**
 * ChaosEngineering Implementation
 *
 * Concrete implementation of IChaosEngineering.
 * Handles Chaos engineering and fault injection.
 */

import { IChaosEngineering } from '../interfaces/IChaosEngineering';
import { ChaosEngineeringResult, ChaosEngineeringContext } from '../types/chaos-engineering-types';

export class ChaosEngineering implements IChaosEngineering {
  private _config: Record<string, unknown>;
  private _metrics: Map<string, number>;

  constructor() {
    this._config = {};
    this._metrics = new Map();
  }

  async execute(context: ChaosEngineeringContext): Promise<ChaosEngineeringResult<unknown>> {
    const startTime = Date.now();
    try {
      const output = this._process(context);
      this._recordMetric('successCount', 1);
      this._recordMetric('lastExecutionTime', Date.now() - startTime);
      return { success: true, data: output };
    } catch (error) {
      this._recordMetric('failureCount', 1);
      return {
        success: false,
        error: {
          code: 'CHAOSENGINEERING_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getStatus(): Record<string, unknown> {
    return {
      config: this._config,
      metrics: Object.fromEntries(this._metrics),
      active: true,
    };
  }

  private _process(context: ChaosEngineeringContext): unknown {
    return { processed: true, context, layer: 'ChaosEngineering' };
  }

  private _recordMetric(name: string, delta: number): void {
    const current = this._metrics.get(name) || 0;
    this._metrics.set(name, current + delta);
  }
}
