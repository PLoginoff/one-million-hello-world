/**
 * ICanaryDeploySpecification interface
 */

export interface ICanaryDeploySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ICanaryDeploySpecification): ICanaryDeploySpecification;
  or(other: ICanaryDeploySpecification): ICanaryDeploySpecification;
  not(): ICanaryDeploySpecification;
}
