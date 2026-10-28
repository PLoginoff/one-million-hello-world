/**
 * ServiceDiscoveryAndSpecification
 */

import { IServiceDiscoverySpecification } from './IServiceDiscoverySpecification';
import { ServiceDiscoveryOrSpecification } from './ServiceDiscoveryOrSpecification';
import { ServiceDiscoveryNotSpecification } from './ServiceDiscoveryNotSpecification';

export class ServiceDiscoveryAndSpecification implements IServiceDiscoverySpecification {
  private _specs: IServiceDiscoverySpecification[];

  constructor(specs: IServiceDiscoverySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IServiceDiscoverySpecification): IServiceDiscoverySpecification {
    return new ServiceDiscoveryAndSpecification([...this._specs, other]);
  }

  or(other: IServiceDiscoverySpecification): IServiceDiscoverySpecification {
    return new ServiceDiscoveryOrSpecification([this, other]);
  }

  not(): IServiceDiscoverySpecification {
    return new ServiceDiscoveryNotSpecification(this);
  }

  getSpecifications(): IServiceDiscoverySpecification[] {
    return [...this._specs];
  }
}
