/**
 * MutationTestingOrSpecification
 */

import { IMutationTestingSpecification } from './IMutationTestingSpecification';
import { MutationTestingAndSpecification } from './MutationTestingAndSpecification';
import { MutationTestingNotSpecification } from './MutationTestingNotSpecification';

export class MutationTestingOrSpecification implements IMutationTestingSpecification {
  private _specs: IMutationTestingSpecification[];

  constructor(specs: IMutationTestingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMutationTestingSpecification): IMutationTestingSpecification {
    return new MutationTestingAndSpecification([this, other]);
  }

  or(other: IMutationTestingSpecification): IMutationTestingSpecification {
    return new MutationTestingOrSpecification([...this._specs, other]);
  }

  not(): IMutationTestingSpecification {
    return new MutationTestingNotSpecification(this);
  }

  getSpecifications(): IMutationTestingSpecification[] {
    return [...this._specs];
  }
}
