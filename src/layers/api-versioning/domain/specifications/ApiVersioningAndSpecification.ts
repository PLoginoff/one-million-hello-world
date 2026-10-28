/**
 * ApiVersioningAndSpecification
 */

import { IApiVersioningSpecification } from './IApiVersioningSpecification';
import { ApiVersioningOrSpecification } from './ApiVersioningOrSpecification';
import { ApiVersioningNotSpecification } from './ApiVersioningNotSpecification';

export class ApiVersioningAndSpecification implements IApiVersioningSpecification {
  private _specs: IApiVersioningSpecification[];

  constructor(specs: IApiVersioningSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IApiVersioningSpecification): IApiVersioningSpecification {
    return new ApiVersioningAndSpecification([...this._specs, other]);
  }

  or(other: IApiVersioningSpecification): IApiVersioningSpecification {
    return new ApiVersioningOrSpecification([this, other]);
  }

  not(): IApiVersioningSpecification {
    return new ApiVersioningNotSpecification(this);
  }

  getSpecifications(): IApiVersioningSpecification[] {
    return [...this._specs];
  }
}
