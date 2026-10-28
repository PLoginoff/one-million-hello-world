/**
 * ServiceOrSpecification
 */

import { IServiceSpecification } from './IServiceSpecification';
import { ServiceAndSpecification } from './ServiceAndSpecification';
import { ServiceNotSpecification } from './ServiceNotSpecification';

export class ServiceOrSpecification implements IServiceSpecification {
  private _specs: IServiceSpecification[];

  constructor(specs: IServiceSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IServiceSpecification): IServiceSpecification {
    return new ServiceAndSpecification([this, other]);
  }

  or(other: IServiceSpecification): IServiceSpecification {
    return new ServiceOrSpecification([...this._specs, other]);
  }

  not(): IServiceSpecification {
    return new ServiceNotSpecification(this);
  }

  getSpecifications(): IServiceSpecification[] {
    return [...this._specs];
  }
}
