/**
 * RepositoryOrSpecification
 */

import { IRepositorySpecification } from './IRepositorySpecification';
import { RepositoryAndSpecification } from './RepositoryAndSpecification';
import { RepositoryNotSpecification } from './RepositoryNotSpecification';

export class RepositoryOrSpecification implements IRepositorySpecification {
  private _specs: IRepositorySpecification[];

  constructor(specs: IRepositorySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRepositorySpecification): IRepositorySpecification {
    return new RepositoryAndSpecification([this, other]);
  }

  or(other: IRepositorySpecification): IRepositorySpecification {
    return new RepositoryOrSpecification([...this._specs, other]);
  }

  not(): IRepositorySpecification {
    return new RepositoryNotSpecification(this);
  }

  getSpecifications(): IRepositorySpecification[] {
    return [...this._specs];
  }
}
