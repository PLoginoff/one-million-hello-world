/**
 * LoadBalancerOrSpecification
 */

import { ILoadBalancerSpecification } from './ILoadBalancerSpecification';
import { LoadBalancerAndSpecification } from './LoadBalancerAndSpecification';
import { LoadBalancerNotSpecification } from './LoadBalancerNotSpecification';

export class LoadBalancerOrSpecification implements ILoadBalancerSpecification {
  private _specs: ILoadBalancerSpecification[];

  constructor(specs: ILoadBalancerSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ILoadBalancerSpecification): ILoadBalancerSpecification {
    return new LoadBalancerAndSpecification([this, other]);
  }

  or(other: ILoadBalancerSpecification): ILoadBalancerSpecification {
    return new LoadBalancerOrSpecification([...this._specs, other]);
  }

  not(): ILoadBalancerSpecification {
    return new LoadBalancerNotSpecification(this);
  }

  getSpecifications(): ILoadBalancerSpecification[] {
    return [...this._specs];
  }
}
