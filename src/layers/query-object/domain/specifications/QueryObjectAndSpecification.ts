/**
 * QueryObjectAndSpecification
 */

import { IQueryObjectSpecification } from './IQueryObjectSpecification';
import { QueryObjectOrSpecification } from './QueryObjectOrSpecification';
import { QueryObjectNotSpecification } from './QueryObjectNotSpecification';

export class QueryObjectAndSpecification implements IQueryObjectSpecification {
  private _specs: IQueryObjectSpecification[];

  constructor(specs: IQueryObjectSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IQueryObjectSpecification): IQueryObjectSpecification {
    return new QueryObjectAndSpecification([...this._specs, other]);
  }

  or(other: IQueryObjectSpecification): IQueryObjectSpecification {
    return new QueryObjectOrSpecification([this, other]);
  }

  not(): IQueryObjectSpecification {
    return new QueryObjectNotSpecification(this);
  }

  getSpecifications(): IQueryObjectSpecification[] {
    return [...this._specs];
  }
}
