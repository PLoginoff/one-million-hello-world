/**
 * RouterNotSpecification
 */

import { IRouterSpecification } from './IRouterSpecification';
import { RouterAndSpecification } from './RouterAndSpecification';
import { RouterOrSpecification } from './RouterOrSpecification';

export class RouterNotSpecification implements IRouterSpecification {
  private _spec: IRouterSpecification;

  constructor(spec: IRouterSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IRouterSpecification): IRouterSpecification {
    return new RouterAndSpecification([this, other]);
  }

  or(other: IRouterSpecification): IRouterSpecification {
    return new RouterOrSpecification([this, other]);
  }

  not(): IRouterSpecification {
    return this._spec;
  }

  getInner(): IRouterSpecification {
    return this._spec;
  }
}
