/**
 * LoadBalancerAndSpecification
 */

import { ILoadBalancerSpecification } from './ILoadBalancerSpecification';
import { LoadBalancerOrSpecification } from './LoadBalancerOrSpecification';
import { LoadBalancerNotSpecification } from './LoadBalancerNotSpecification';

export class LoadBalancerAndSpecification implements ILoadBalancerSpecification {
  private _specs: ILoadBalancerSpecification[];

  constructor(specs: ILoadBalancerSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ILoadBalancerSpecification): ILoadBalancerSpecification {
    return new LoadBalancerAndSpecification([...this._specs, other]);
  }

  or(other: ILoadBalancerSpecification): ILoadBalancerSpecification {
    return new LoadBalancerOrSpecification([this, other]);
  }

  not(): ILoadBalancerSpecification {
    return new LoadBalancerNotSpecification(this);
  }

  getSpecifications(): ILoadBalancerSpecification[] {
    return [...this._specs];
  }
}
