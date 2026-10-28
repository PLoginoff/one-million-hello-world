/**
 * RepositoryAndSpecification
 */

import { IRepositorySpecification } from './IRepositorySpecification';
import { RepositoryOrSpecification } from './RepositoryOrSpecification';
import { RepositoryNotSpecification } from './RepositoryNotSpecification';

export class RepositoryAndSpecification implements IRepositorySpecification {
  private _specs: IRepositorySpecification[];

  constructor(specs: IRepositorySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRepositorySpecification): IRepositorySpecification {
    return new RepositoryAndSpecification([...this._specs, other]);
  }

  or(other: IRepositorySpecification): IRepositorySpecification {
    return new RepositoryOrSpecification([this, other]);
  }

  not(): IRepositorySpecification {
    return new RepositoryNotSpecification(this);
  }

  getSpecifications(): IRepositorySpecification[] {
    return [...this._specs];
  }
}
