/**
 * IMlFeatureStoreSpecification interface
 */

export interface IMlFeatureStoreSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IMlFeatureStoreSpecification): IMlFeatureStoreSpecification;
  or(other: IMlFeatureStoreSpecification): IMlFeatureStoreSpecification;
  not(): IMlFeatureStoreSpecification;
}
