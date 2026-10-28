/**
 * UnitOfWorkOrSpecification
 */

import { IUnitOfWorkSpecification } from './IUnitOfWorkSpecification';
import { UnitOfWorkAndSpecification } from './UnitOfWorkAndSpecification';
import { UnitOfWorkNotSpecification } from './UnitOfWorkNotSpecification';

export class UnitOfWorkOrSpecification implements IUnitOfWorkSpecification {
  private _specs: IUnitOfWorkSpecification[];

  constructor(specs: IUnitOfWorkSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IUnitOfWorkSpecification): IUnitOfWorkSpecification {
    return new UnitOfWorkAndSpecification([this, other]);
  }

  or(other: IUnitOfWorkSpecification): IUnitOfWorkSpecification {
    return new UnitOfWorkOrSpecification([...this._specs, other]);
  }

  not(): IUnitOfWorkSpecification {
    return new UnitOfWorkNotSpecification(this);
  }

  getSpecifications(): IUnitOfWorkSpecification[] {
    return [...this._specs];
  }
}
