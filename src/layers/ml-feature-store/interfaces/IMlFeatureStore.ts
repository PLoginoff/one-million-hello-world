/**
 * MlFeatureStore Interface
 *
 * Defines the contract for the ML feature storage, serving, and versioning layer.
 */

import { MlFeatureStoreResult, MlFeatureStoreContext } from '../types/ml-feature-store-types';

export interface IMlFeatureStore {
  execute(context: MlFeatureStoreContext): Promise<MlFeatureStoreResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
