/**
 * Recommendation Interface
 *
 * Defines the contract for the Recommendation engine with collaborative and content filtering layer.
 */

import { RecommendationResult, RecommendationContext } from '../types/recommendation-types';

export interface IRecommendation {
  execute(context: RecommendationContext): Promise<RecommendationResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
