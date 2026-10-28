/**
 * RecommendationAndSpecification
 */

import { IRecommendationSpecification } from './IRecommendationSpecification';
import { RecommendationOrSpecification } from './RecommendationOrSpecification';
import { RecommendationNotSpecification } from './RecommendationNotSpecification';

export class RecommendationAndSpecification implements IRecommendationSpecification {
  private _specs: IRecommendationSpecification[];

  constructor(specs: IRecommendationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRecommendationSpecification): IRecommendationSpecification {
    return new RecommendationAndSpecification([...this._specs, other]);
  }

  or(other: IRecommendationSpecification): IRecommendationSpecification {
    return new RecommendationOrSpecification([this, other]);
  }

  not(): IRecommendationSpecification {
    return new RecommendationNotSpecification(this);
  }

  getSpecifications(): IRecommendationSpecification[] {
    return [...this._specs];
  }
}
