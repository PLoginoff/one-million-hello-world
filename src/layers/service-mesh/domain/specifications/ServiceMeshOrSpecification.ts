/**
 * ServiceMeshOrSpecification
 */

import { IServiceMeshSpecification } from './IServiceMeshSpecification';
import { ServiceMeshAndSpecification } from './ServiceMeshAndSpecification';
import { ServiceMeshNotSpecification } from './ServiceMeshNotSpecification';

export class ServiceMeshOrSpecification implements IServiceMeshSpecification {
  private _specs: IServiceMeshSpecification[];

  constructor(specs: IServiceMeshSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IServiceMeshSpecification): IServiceMeshSpecification {
    return new ServiceMeshAndSpecification([this, other]);
  }

  or(other: IServiceMeshSpecification): IServiceMeshSpecification {
    return new ServiceMeshOrSpecification([...this._specs, other]);
  }

  not(): IServiceMeshSpecification {
    return new ServiceMeshNotSpecification(this);
  }

  getSpecifications(): IServiceMeshSpecification[] {
    return [...this._specs];
  }
}
