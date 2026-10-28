/**
 * MultiTenancyNotSpecification
 */

import { IMultiTenancySpecification } from './IMultiTenancySpecification';
import { MultiTenancyAndSpecification } from './MultiTenancyAndSpecification';
import { MultiTenancyOrSpecification } from './MultiTenancyOrSpecification';

export class MultiTenancyNotSpecification implements IMultiTenancySpecification {
  private _spec: IMultiTenancySpecification;

  constructor(spec: IMultiTenancySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IMultiTenancySpecification): IMultiTenancySpecification {
    return new MultiTenancyAndSpecification([this, other]);
  }

  or(other: IMultiTenancySpecification): IMultiTenancySpecification {
    return new MultiTenancyOrSpecification([this, other]);
  }

  not(): IMultiTenancySpecification {
    return this._spec;
  }

  getInner(): IMultiTenancySpecification {
    return this._spec;
  }
}
