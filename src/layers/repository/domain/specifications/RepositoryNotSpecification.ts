/**
 * RepositoryNotSpecification
 */

import { IRepositorySpecification } from './IRepositorySpecification';
import { RepositoryAndSpecification } from './RepositoryAndSpecification';
import { RepositoryOrSpecification } from './RepositoryOrSpecification';

export class RepositoryNotSpecification implements IRepositorySpecification {
  private _spec: IRepositorySpecification;

  constructor(spec: IRepositorySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IRepositorySpecification): IRepositorySpecification {
    return new RepositoryAndSpecification([this, other]);
  }

  or(other: IRepositorySpecification): IRepositorySpecification {
    return new RepositoryOrSpecification([this, other]);
  }

  not(): IRepositorySpecification {
    return this._spec;
  }

  getInner(): IRepositorySpecification {
    return this._spec;
  }
}
