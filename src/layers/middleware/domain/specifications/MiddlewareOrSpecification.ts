/**
 * MiddlewareOrSpecification
 */

import { IMiddlewareSpecification } from './IMiddlewareSpecification';
import { MiddlewareAndSpecification } from './MiddlewareAndSpecification';
import { MiddlewareNotSpecification } from './MiddlewareNotSpecification';

export class MiddlewareOrSpecification implements IMiddlewareSpecification {
  private _specs: IMiddlewareSpecification[];

  constructor(specs: IMiddlewareSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMiddlewareSpecification): IMiddlewareSpecification {
    return new MiddlewareAndSpecification([this, other]);
  }

  or(other: IMiddlewareSpecification): IMiddlewareSpecification {
    return new MiddlewareOrSpecification([...this._specs, other]);
  }

  not(): IMiddlewareSpecification {
    return new MiddlewareNotSpecification(this);
  }

  getSpecifications(): IMiddlewareSpecification[] {
    return [...this._specs];
  }
}
