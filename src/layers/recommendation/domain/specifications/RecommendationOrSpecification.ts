/**
 * RecommendationOrSpecification
 */

import { IRecommendationSpecification } from './IRecommendationSpecification';
import { RecommendationAndSpecification } from './RecommendationAndSpecification';
import { RecommendationNotSpecification } from './RecommendationNotSpecification';

export class RecommendationOrSpecification implements IRecommendationSpecification {
  private _specs: IRecommendationSpecification[];

  constructor(specs: IRecommendationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRecommendationSpecification): IRecommendationSpecification {
    return new RecommendationAndSpecification([this, other]);
  }

  or(other: IRecommendationSpecification): IRecommendationSpecification {
    return new RecommendationOrSpecification([...this._specs, other]);
  }

  not(): IRecommendationSpecification {
    return new RecommendationNotSpecification(this);
  }

  getSpecifications(): IRecommendationSpecification[] {
    return [...this._specs];
  }
}
