/**
 * SpecificationNotSpecification
 */

import { ISpecificationSpecification } from './ISpecificationSpecification';
import { SpecificationAndSpecification } from './SpecificationAndSpecification';
import { SpecificationOrSpecification } from './SpecificationOrSpecification';

export class SpecificationNotSpecification implements ISpecificationSpecification {
  private _spec: ISpecificationSpecification;

  constructor(spec: ISpecificationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISpecificationSpecification): ISpecificationSpecification {
    return new SpecificationAndSpecification([this, other]);
  }

  or(other: ISpecificationSpecification): ISpecificationSpecification {
    return new SpecificationOrSpecification([this, other]);
  }

  not(): ISpecificationSpecification {
    return this._spec;
  }

  getInner(): ISpecificationSpecification {
    return this._spec;
  }
}
