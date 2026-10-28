/**
 * ApiVersioningOrSpecification
 */

import { IApiVersioningSpecification } from './IApiVersioningSpecification';
import { ApiVersioningAndSpecification } from './ApiVersioningAndSpecification';
import { ApiVersioningNotSpecification } from './ApiVersioningNotSpecification';

export class ApiVersioningOrSpecification implements IApiVersioningSpecification {
  private _specs: IApiVersioningSpecification[];

  constructor(specs: IApiVersioningSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IApiVersioningSpecification): IApiVersioningSpecification {
    return new ApiVersioningAndSpecification([this, other]);
  }

  or(other: IApiVersioningSpecification): IApiVersioningSpecification {
    return new ApiVersioningOrSpecification([...this._specs, other]);
  }

  not(): IApiVersioningSpecification {
    return new ApiVersioningNotSpecification(this);
  }

  getSpecifications(): IApiVersioningSpecification[] {
    return [...this._specs];
  }
}
