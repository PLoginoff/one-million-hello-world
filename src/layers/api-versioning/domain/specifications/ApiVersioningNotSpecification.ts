/**
 * ApiVersioningNotSpecification
 */

import { IApiVersioningSpecification } from './IApiVersioningSpecification';
import { ApiVersioningAndSpecification } from './ApiVersioningAndSpecification';
import { ApiVersioningOrSpecification } from './ApiVersioningOrSpecification';

export class ApiVersioningNotSpecification implements IApiVersioningSpecification {
  private _spec: IApiVersioningSpecification;

  constructor(spec: IApiVersioningSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IApiVersioningSpecification): IApiVersioningSpecification {
    return new ApiVersioningAndSpecification([this, other]);
  }

  or(other: IApiVersioningSpecification): IApiVersioningSpecification {
    return new ApiVersioningOrSpecification([this, other]);
  }

  not(): IApiVersioningSpecification {
    return this._spec;
  }

  getInner(): IApiVersioningSpecification {
    return this._spec;
  }
}
