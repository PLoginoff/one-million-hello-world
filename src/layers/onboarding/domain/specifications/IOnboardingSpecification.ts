/**
 * IOnboardingSpecification interface
 */

export interface IOnboardingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IOnboardingSpecification): IOnboardingSpecification;
  or(other: IOnboardingSpecification): IOnboardingSpecification;
  not(): IOnboardingSpecification;
}
