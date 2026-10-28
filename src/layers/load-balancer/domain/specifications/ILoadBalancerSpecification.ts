/**
 * ILoadBalancerSpecification interface
 */

export interface ILoadBalancerSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ILoadBalancerSpecification): ILoadBalancerSpecification;
  or(other: ILoadBalancerSpecification): ILoadBalancerSpecification;
  not(): ILoadBalancerSpecification;
}
