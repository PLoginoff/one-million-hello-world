/**
 * MiddlewareAndSpecification
 */

import { IMiddlewareSpecification } from './IMiddlewareSpecification';
import { MiddlewareOrSpecification } from './MiddlewareOrSpecification';
import { MiddlewareNotSpecification } from './MiddlewareNotSpecification';

export class MiddlewareAndSpecification implements IMiddlewareSpecification {
  private _specs: IMiddlewareSpecification[];

  constructor(specs: IMiddlewareSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMiddlewareSpecification): IMiddlewareSpecification {
    return new MiddlewareAndSpecification([...this._specs, other]);
  }

  or(other: IMiddlewareSpecification): IMiddlewareSpecification {
    return new MiddlewareOrSpecification([this, other]);
  }

  not(): IMiddlewareSpecification {
    return new MiddlewareNotSpecification(this);
  }

  getSpecifications(): IMiddlewareSpecification[] {
    return [...this._specs];
  }
}
