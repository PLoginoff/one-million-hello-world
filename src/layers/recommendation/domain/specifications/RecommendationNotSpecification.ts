/**
 * RecommendationNotSpecification
 */

import { IRecommendationSpecification } from './IRecommendationSpecification';
import { RecommendationAndSpecification } from './RecommendationAndSpecification';
import { RecommendationOrSpecification } from './RecommendationOrSpecification';

export class RecommendationNotSpecification implements IRecommendationSpecification {
  private _spec: IRecommendationSpecification;

  constructor(spec: IRecommendationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IRecommendationSpecification): IRecommendationSpecification {
    return new RecommendationAndSpecification([this, other]);
  }

  or(other: IRecommendationSpecification): IRecommendationSpecification {
    return new RecommendationOrSpecification([this, other]);
  }

  not(): IRecommendationSpecification {
    return this._spec;
  }

  getInner(): IRecommendationSpecification {
    return this._spec;
  }
}
