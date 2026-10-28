/**
 * ServiceNotSpecification
 */

import { IServiceSpecification } from './IServiceSpecification';
import { ServiceAndSpecification } from './ServiceAndSpecification';
import { ServiceOrSpecification } from './ServiceOrSpecification';

export class ServiceNotSpecification implements IServiceSpecification {
  private _spec: IServiceSpecification;

  constructor(spec: IServiceSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IServiceSpecification): IServiceSpecification {
    return new ServiceAndSpecification([this, other]);
  }

  or(other: IServiceSpecification): IServiceSpecification {
    return new ServiceOrSpecification([this, other]);
  }

  not(): IServiceSpecification {
    return this._spec;
  }

  getInner(): IServiceSpecification {
    return this._spec;
  }
}
