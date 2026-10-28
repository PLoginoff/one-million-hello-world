/**
 * MutationTestingNotSpecification
 */

import { IMutationTestingSpecification } from './IMutationTestingSpecification';
import { MutationTestingAndSpecification } from './MutationTestingAndSpecification';
import { MutationTestingOrSpecification } from './MutationTestingOrSpecification';

export class MutationTestingNotSpecification implements IMutationTestingSpecification {
  private _spec: IMutationTestingSpecification;

  constructor(spec: IMutationTestingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IMutationTestingSpecification): IMutationTestingSpecification {
    return new MutationTestingAndSpecification([this, other]);
  }

  or(other: IMutationTestingSpecification): IMutationTestingSpecification {
    return new MutationTestingOrSpecification([this, other]);
  }

  not(): IMutationTestingSpecification {
    return this._spec;
  }

  getInner(): IMutationTestingSpecification {
    return this._spec;
  }
}
