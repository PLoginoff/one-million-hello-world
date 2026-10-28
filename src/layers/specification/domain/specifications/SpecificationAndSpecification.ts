/**
 * SpecificationAndSpecification
 */

import { ISpecificationSpecification } from './ISpecificationSpecification';
import { SpecificationOrSpecification } from './SpecificationOrSpecification';
import { SpecificationNotSpecification } from './SpecificationNotSpecification';

export class SpecificationAndSpecification implements ISpecificationSpecification {
  private _specs: ISpecificationSpecification[];

  constructor(specs: ISpecificationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISpecificationSpecification): ISpecificationSpecification {
    return new SpecificationAndSpecification([...this._specs, other]);
  }

  or(other: ISpecificationSpecification): ISpecificationSpecification {
    return new SpecificationOrSpecification([this, other]);
  }

  not(): ISpecificationSpecification {
    return new SpecificationNotSpecification(this);
  }

  getSpecifications(): ISpecificationSpecification[] {
    return [...this._specs];
  }
}
