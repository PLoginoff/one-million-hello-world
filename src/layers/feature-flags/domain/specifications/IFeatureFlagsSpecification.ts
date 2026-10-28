/**
 * IFeatureFlagsSpecification interface
 */

export interface IFeatureFlagsSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IFeatureFlagsSpecification): IFeatureFlagsSpecification;
  or(other: IFeatureFlagsSpecification): IFeatureFlagsSpecification;
  not(): IFeatureFlagsSpecification;
}
