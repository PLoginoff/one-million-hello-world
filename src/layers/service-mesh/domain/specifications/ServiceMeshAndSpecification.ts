/**
 * ServiceMeshAndSpecification
 */

import { IServiceMeshSpecification } from './IServiceMeshSpecification';
import { ServiceMeshOrSpecification } from './ServiceMeshOrSpecification';
import { ServiceMeshNotSpecification } from './ServiceMeshNotSpecification';

export class ServiceMeshAndSpecification implements IServiceMeshSpecification {
  private _specs: IServiceMeshSpecification[];

  constructor(specs: IServiceMeshSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IServiceMeshSpecification): IServiceMeshSpecification {
    return new ServiceMeshAndSpecification([...this._specs, other]);
  }

  or(other: IServiceMeshSpecification): IServiceMeshSpecification {
    return new ServiceMeshOrSpecification([this, other]);
  }

  not(): IServiceMeshSpecification {
    return new ServiceMeshNotSpecification(this);
  }

  getSpecifications(): IServiceMeshSpecification[] {
    return [...this._specs];
  }
}
