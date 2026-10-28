/**
 * SpecificationOrSpecification
 */

import { ISpecificationSpecification } from './ISpecificationSpecification';
import { SpecificationAndSpecification } from './SpecificationAndSpecification';
import { SpecificationNotSpecification } from './SpecificationNotSpecification';

export class SpecificationOrSpecification implements ISpecificationSpecification {
  private _specs: ISpecificationSpecification[];

  constructor(specs: ISpecificationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISpecificationSpecification): ISpecificationSpecification {
    return new SpecificationAndSpecification([this, other]);
  }

  or(other: ISpecificationSpecification): ISpecificationSpecification {
    return new SpecificationOrSpecification([...this._specs, other]);
  }

  not(): ISpecificationSpecification {
    return new SpecificationNotSpecification(this);
  }

  getSpecifications(): ISpecificationSpecification[] {
    return [...this._specs];
  }
}
