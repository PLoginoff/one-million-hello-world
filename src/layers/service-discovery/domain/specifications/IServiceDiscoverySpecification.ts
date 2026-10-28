/**
 * IServiceDiscoverySpecification interface
 */

export interface IServiceDiscoverySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IServiceDiscoverySpecification): IServiceDiscoverySpecification;
  or(other: IServiceDiscoverySpecification): IServiceDiscoverySpecification;
  not(): IServiceDiscoverySpecification;
}
