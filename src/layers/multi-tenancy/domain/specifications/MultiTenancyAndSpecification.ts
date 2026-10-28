/**
 * MultiTenancyAndSpecification
 */

import { IMultiTenancySpecification } from './IMultiTenancySpecification';
import { MultiTenancyOrSpecification } from './MultiTenancyOrSpecification';
import { MultiTenancyNotSpecification } from './MultiTenancyNotSpecification';

export class MultiTenancyAndSpecification implements IMultiTenancySpecification {
  private _specs: IMultiTenancySpecification[];

  constructor(specs: IMultiTenancySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMultiTenancySpecification): IMultiTenancySpecification {
    return new MultiTenancyAndSpecification([...this._specs, other]);
  }

  or(other: IMultiTenancySpecification): IMultiTenancySpecification {
    return new MultiTenancyOrSpecification([this, other]);
  }

  not(): IMultiTenancySpecification {
    return new MultiTenancyNotSpecification(this);
  }

  getSpecifications(): IMultiTenancySpecification[] {
    return [...this._specs];
  }
}
