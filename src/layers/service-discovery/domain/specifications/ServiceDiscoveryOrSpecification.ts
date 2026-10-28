/**
 * ServiceDiscoveryOrSpecification
 */

import { IServiceDiscoverySpecification } from './IServiceDiscoverySpecification';
import { ServiceDiscoveryAndSpecification } from './ServiceDiscoveryAndSpecification';
import { ServiceDiscoveryNotSpecification } from './ServiceDiscoveryNotSpecification';

export class ServiceDiscoveryOrSpecification implements IServiceDiscoverySpecification {
  private _specs: IServiceDiscoverySpecification[];

  constructor(specs: IServiceDiscoverySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IServiceDiscoverySpecification): IServiceDiscoverySpecification {
    return new ServiceDiscoveryAndSpecification([this, other]);
  }

  or(other: IServiceDiscoverySpecification): IServiceDiscoverySpecification {
    return new ServiceDiscoveryOrSpecification([...this._specs, other]);
  }

  not(): IServiceDiscoverySpecification {
    return new ServiceDiscoveryNotSpecification(this);
  }

  getSpecifications(): IServiceDiscoverySpecification[] {
    return [...this._specs];
  }
}
