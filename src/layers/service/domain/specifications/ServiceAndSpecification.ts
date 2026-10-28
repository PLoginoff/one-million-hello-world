/**
 * ServiceAndSpecification
 */

import { IServiceSpecification } from './IServiceSpecification';
import { ServiceOrSpecification } from './ServiceOrSpecification';
import { ServiceNotSpecification } from './ServiceNotSpecification';

export class ServiceAndSpecification implements IServiceSpecification {
  private _specs: IServiceSpecification[];

  constructor(specs: IServiceSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IServiceSpecification): IServiceSpecification {
    return new ServiceAndSpecification([...this._specs, other]);
  }

  or(other: IServiceSpecification): IServiceSpecification {
    return new ServiceOrSpecification([this, other]);
  }

  not(): IServiceSpecification {
    return new ServiceNotSpecification(this);
  }

  getSpecifications(): IServiceSpecification[] {
    return [...this._specs];
  }
}
