/**
 * IBlueGreenDeploySpecification interface
 */

export interface IBlueGreenDeploySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IBlueGreenDeploySpecification): IBlueGreenDeploySpecification;
  or(other: IBlueGreenDeploySpecification): IBlueGreenDeploySpecification;
  not(): IBlueGreenDeploySpecification;
}
