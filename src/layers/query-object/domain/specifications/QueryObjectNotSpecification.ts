/**
 * QueryObjectNotSpecification
 */

import { IQueryObjectSpecification } from './IQueryObjectSpecification';
import { QueryObjectAndSpecification } from './QueryObjectAndSpecification';
import { QueryObjectOrSpecification } from './QueryObjectOrSpecification';

export class QueryObjectNotSpecification implements IQueryObjectSpecification {
  private _spec: IQueryObjectSpecification;

  constructor(spec: IQueryObjectSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IQueryObjectSpecification): IQueryObjectSpecification {
    return new QueryObjectAndSpecification([this, other]);
  }

  or(other: IQueryObjectSpecification): IQueryObjectSpecification {
    return new QueryObjectOrSpecification([this, other]);
  }

  not(): IQueryObjectSpecification {
    return this._spec;
  }

  getInner(): IQueryObjectSpecification {
    return this._spec;
  }
}
