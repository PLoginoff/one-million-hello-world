/**
 * UnitOfWorkNotSpecification
 */

import { IUnitOfWorkSpecification } from './IUnitOfWorkSpecification';
import { UnitOfWorkAndSpecification } from './UnitOfWorkAndSpecification';
import { UnitOfWorkOrSpecification } from './UnitOfWorkOrSpecification';

export class UnitOfWorkNotSpecification implements IUnitOfWorkSpecification {
  private _spec: IUnitOfWorkSpecification;

  constructor(spec: IUnitOfWorkSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IUnitOfWorkSpecification): IUnitOfWorkSpecification {
    return new UnitOfWorkAndSpecification([this, other]);
  }

  or(other: IUnitOfWorkSpecification): IUnitOfWorkSpecification {
    return new UnitOfWorkOrSpecification([this, other]);
  }

  not(): IUnitOfWorkSpecification {
    return this._spec;
  }

  getInner(): IUnitOfWorkSpecification {
    return this._spec;
  }
}
