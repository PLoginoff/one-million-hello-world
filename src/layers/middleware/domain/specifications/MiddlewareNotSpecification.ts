/**
 * MiddlewareNotSpecification
 */

import { IMiddlewareSpecification } from './IMiddlewareSpecification';
import { MiddlewareAndSpecification } from './MiddlewareAndSpecification';
import { MiddlewareOrSpecification } from './MiddlewareOrSpecification';

export class MiddlewareNotSpecification implements IMiddlewareSpecification {
  private _spec: IMiddlewareSpecification;

  constructor(spec: IMiddlewareSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IMiddlewareSpecification): IMiddlewareSpecification {
    return new MiddlewareAndSpecification([this, other]);
  }

  or(other: IMiddlewareSpecification): IMiddlewareSpecification {
    return new MiddlewareOrSpecification([this, other]);
  }

  not(): IMiddlewareSpecification {
    return this._spec;
  }

  getInner(): IMiddlewareSpecification {
    return this._spec;
  }
}
