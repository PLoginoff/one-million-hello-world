/**
 * UnitOfWorkAndSpecification
 */

import { IUnitOfWorkSpecification } from './IUnitOfWorkSpecification';
import { UnitOfWorkOrSpecification } from './UnitOfWorkOrSpecification';
import { UnitOfWorkNotSpecification } from './UnitOfWorkNotSpecification';

export class UnitOfWorkAndSpecification implements IUnitOfWorkSpecification {
  private _specs: IUnitOfWorkSpecification[];

  constructor(specs: IUnitOfWorkSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IUnitOfWorkSpecification): IUnitOfWorkSpecification {
    return new UnitOfWorkAndSpecification([...this._specs, other]);
  }

  or(other: IUnitOfWorkSpecification): IUnitOfWorkSpecification {
    return new UnitOfWorkOrSpecification([this, other]);
  }

  not(): IUnitOfWorkSpecification {
    return new UnitOfWorkNotSpecification(this);
  }

  getSpecifications(): IUnitOfWorkSpecification[] {
    return [...this._specs];
  }
}
