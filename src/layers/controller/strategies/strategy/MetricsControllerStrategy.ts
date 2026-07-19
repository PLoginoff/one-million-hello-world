/**
 * Metrics Controller Strategy
 *
 * Decorates another strategy with metrics collection for each resolution.
 */

import { IControllerStrategy } from './IControllerStrategy';
import { ControllerEntity } from '../../domain/entities/ControllerEntity';
import { ControllerScopeValueObject } from '../../domain/value-objects/ControllerScopeValueObject';

export interface StrategyMetricsSnapshot {
  totalResolutions: number;
  successfulResolutions: number;
  failedResolutions: number;
  averageResolutionTimeMs: number;
  perController: Array<{ controllerId: string; count: number; avgTimeMs: number }>;
}

export class MetricsControllerStrategy implements IControllerStrategy {
  private readonly _inner: IControllerStrategy;
  private _totalResolutions: number;
  private _successfulResolutions: number;
  private _failedResolutions: number;
  private _resolutionTimes: number[];
  private _perController: Map<string, { count: number; totalTimeMs: number }>;
  private readonly _maxSamples: number;

  constructor(inner: IControllerStrategy, maxSamples: number = 1000) {
    this._inner = inner;
    this._totalResolutions = 0;
    this._successfulResolutions = 0;
    this._failedResolutions = 0;
    this._resolutionTimes = [];
    this._perController = new Map();
    this._maxSamples = maxSamples;
  }

  getName(): string {
    return `METRICS(${this._inner.getName()})`;
  }

  resolve(controller: ControllerEntity, scope: ControllerScopeValueObject): unknown {
    const start = Date.now();
    this._totalResolutions++;

    try {
      const instance = this._inner.resolve(controller, scope);
      const elapsed = Date.now() - start;
      this._successfulResolutions++;
      this._recordTime(elapsed);
      this._recordController(controller.data.id, elapsed);
      return instance;
    } catch (error) {
      const elapsed = Date.now() - start;
      this._failedResolutions++;
      this._recordTime(elapsed);
      this._recordController(controller.data.id, elapsed);
      throw error;
    }
  }

  private _recordTime(elapsed: number): void {
    this._resolutionTimes.push(elapsed);
    if (this._resolutionTimes.length > this._maxSamples) {
      this._resolutionTimes.shift();
    }
  }

  private _recordController(controllerId: string, elapsed: number): void {
    const existing = this._perController.get(controllerId);
    if (existing !== undefined) {
      existing.count++;
      existing.totalTimeMs += elapsed;
    } else {
      this._perController.set(controllerId, { count: 1, totalTimeMs: elapsed });
    }
  }

  getMetrics(): StrategyMetricsSnapshot {
    const perController: Array<{ controllerId: string; count: number; avgTimeMs: number }> = [];
    for (const [controllerId, data] of this._perController) {
      perController.push({
        controllerId,
        count: data.count,
        avgTimeMs: data.count > 0 ? data.totalTimeMs / data.count : 0,
      });
    }
    perController.sort((a, b) => b.count - a.count);

    return {
      totalResolutions: this._totalResolutions,
      successfulResolutions: this._successfulResolutions,
      failedResolutions: this._failedResolutions,
      averageResolutionTimeMs:
        this._resolutionTimes.length > 0
          ? this._resolutionTimes.reduce((sum, t) => sum + t, 0) / this._resolutionTimes.length
          : 0,
      perController,
    };
  }

  reset(): void {
    this._totalResolutions = 0;
    this._successfulResolutions = 0;
    this._failedResolutions = 0;
    this._resolutionTimes = [];
    this._perController.clear();
  }
}
