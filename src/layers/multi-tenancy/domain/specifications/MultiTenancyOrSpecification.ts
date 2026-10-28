/**
 * MultiTenancyOrSpecification
 */

import { IMultiTenancySpecification } from './IMultiTenancySpecification';
import { MultiTenancyAndSpecification } from './MultiTenancyAndSpecification';
import { MultiTenancyNotSpecification } from './MultiTenancyNotSpecification';

export class MultiTenancyOrSpecification implements IMultiTenancySpecification {
  private _specs: IMultiTenancySpecification[];

  constructor(specs: IMultiTenancySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMultiTenancySpecification): IMultiTenancySpecification {
    return new MultiTenancyAndSpecification([this, other]);
  }

  or(other: IMultiTenancySpecification): IMultiTenancySpecification {
    return new MultiTenancyOrSpecification([...this._specs, other]);
  }

  not(): IMultiTenancySpecification {
    return new MultiTenancyNotSpecification(this);
  }

  getSpecifications(): IMultiTenancySpecification[] {
    return [...this._specs];
  }
}
