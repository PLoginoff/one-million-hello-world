/**
 * IRecommendationSpecification interface
 */

export interface IRecommendationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IRecommendationSpecification): IRecommendationSpecification;
  or(other: IRecommendationSpecification): IRecommendationSpecification;
  not(): IRecommendationSpecification;
}
