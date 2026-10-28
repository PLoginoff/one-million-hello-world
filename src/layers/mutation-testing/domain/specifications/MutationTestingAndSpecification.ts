/**
 * MutationTestingAndSpecification
 */

import { IMutationTestingSpecification } from './IMutationTestingSpecification';
import { MutationTestingOrSpecification } from './MutationTestingOrSpecification';
import { MutationTestingNotSpecification } from './MutationTestingNotSpecification';

export class MutationTestingAndSpecification implements IMutationTestingSpecification {
  private _specs: IMutationTestingSpecification[];

  constructor(specs: IMutationTestingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMutationTestingSpecification): IMutationTestingSpecification {
    return new MutationTestingAndSpecification([...this._specs, other]);
  }

  or(other: IMutationTestingSpecification): IMutationTestingSpecification {
    return new MutationTestingOrSpecification([this, other]);
  }

  not(): IMutationTestingSpecification {
    return new MutationTestingNotSpecification(this);
  }

  getSpecifications(): IMutationTestingSpecification[] {
    return [...this._specs];
  }
}
