/**
 * ServiceDiscoveryNotSpecification
 */

import { IServiceDiscoverySpecification } from './IServiceDiscoverySpecification';
import { ServiceDiscoveryAndSpecification } from './ServiceDiscoveryAndSpecification';
import { ServiceDiscoveryOrSpecification } from './ServiceDiscoveryOrSpecification';

export class ServiceDiscoveryNotSpecification implements IServiceDiscoverySpecification {
  private _spec: IServiceDiscoverySpecification;

  constructor(spec: IServiceDiscoverySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IServiceDiscoverySpecification): IServiceDiscoverySpecification {
    return new ServiceDiscoveryAndSpecification([this, other]);
  }

  or(other: IServiceDiscoverySpecification): IServiceDiscoverySpecification {
    return new ServiceDiscoveryOrSpecification([this, other]);
  }

  not(): IServiceDiscoverySpecification {
    return this._spec;
  }

  getInner(): IServiceDiscoverySpecification {
    return this._spec;
  }
}
