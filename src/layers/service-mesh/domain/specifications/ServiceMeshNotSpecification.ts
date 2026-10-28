/**
 * ServiceMeshNotSpecification
 */

import { IServiceMeshSpecification } from './IServiceMeshSpecification';
import { ServiceMeshAndSpecification } from './ServiceMeshAndSpecification';
import { ServiceMeshOrSpecification } from './ServiceMeshOrSpecification';

export class ServiceMeshNotSpecification implements IServiceMeshSpecification {
  private _spec: IServiceMeshSpecification;

  constructor(spec: IServiceMeshSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IServiceMeshSpecification): IServiceMeshSpecification {
    return new ServiceMeshAndSpecification([this, other]);
  }

  or(other: IServiceMeshSpecification): IServiceMeshSpecification {
    return new ServiceMeshOrSpecification([this, other]);
  }

  not(): IServiceMeshSpecification {
    return this._spec;
  }

  getInner(): IServiceMeshSpecification {
    return this._spec;
  }
}
