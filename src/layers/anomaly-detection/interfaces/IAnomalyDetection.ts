/**
 * AnomalyDetection Interface
 *
 * Defines the contract for the Anomaly detection with statistical and ML methods layer.
 */

import { AnomalyDetectionResult, AnomalyDetectionContext } from '../types/anomaly-detection-types';

export interface IAnomalyDetection {
  execute(context: AnomalyDetectionContext): Promise<AnomalyDetectionResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
