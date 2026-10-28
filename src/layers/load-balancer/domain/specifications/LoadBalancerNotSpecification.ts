/**
 * LoadBalancerNotSpecification
 */

import { ILoadBalancerSpecification } from './ILoadBalancerSpecification';
import { LoadBalancerAndSpecification } from './LoadBalancerAndSpecification';
import { LoadBalancerOrSpecification } from './LoadBalancerOrSpecification';

export class LoadBalancerNotSpecification implements ILoadBalancerSpecification {
  private _spec: ILoadBalancerSpecification;

  constructor(spec: ILoadBalancerSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ILoadBalancerSpecification): ILoadBalancerSpecification {
    return new LoadBalancerAndSpecification([this, other]);
  }

  or(other: ILoadBalancerSpecification): ILoadBalancerSpecification {
    return new LoadBalancerOrSpecification([this, other]);
  }

  not(): ILoadBalancerSpecification {
    return this._spec;
  }

  getInner(): ILoadBalancerSpecification {
    return this._spec;
  }
}
