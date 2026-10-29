/**
 * DdosProtectionEngine
 *
 * Composes all detectors into a single inspect() call: every event is pushed
 * through every registered detector and the results merged with the
 * highest-severity verdict winning.
 *
 * @module DdosProtectionLayer/Strategies
 */

import { DetectionResult, IDetector, TrafficEvent, mergeResults } from '../types/traffic';

export class DdosProtectionEngine {
  private readonly _detectors: IDetector[] = [];

  register(detector: IDetector): void {
    this._detectors.push(detector);
  }

  unregister(name: string): boolean {
    const i = this._detectors.findIndex((d) => d.name === name);
    if (i < 0) {
      return false;
    }
    this._detectors.splice(i, 1);
    return true;
  }

  inspect(event: TrafficEvent): DetectionResult {
    return mergeResults(this._detectors.map((d) => d.inspect(event)));
  }

  tick(now: number = Date.now()): void {
    for (const d of this._detectors) {
      d.tick?.(now);
    }
  }

  reset(): void {
    for (const d of this._detectors) {
      d.reset?.();
    }
  }

  get detectors(): readonly IDetector[] {
    return this._detectors;
  }
}
