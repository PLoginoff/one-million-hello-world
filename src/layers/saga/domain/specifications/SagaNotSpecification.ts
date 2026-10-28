/**
 * SagaNotSpecification
 */

import { ISagaSpecification } from './ISagaSpecification';
import { SagaAndSpecification } from './SagaAndSpecification';
import { SagaOrSpecification } from './SagaOrSpecification';

export class SagaNotSpecification implements ISagaSpecification {
  private _spec: ISagaSpecification;

  constructor(spec: ISagaSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISagaSpecification): ISagaSpecification {
    return new SagaAndSpecification([this, other]);
  }

  or(other: ISagaSpecification): ISagaSpecification {
    return new SagaOrSpecification([this, other]);
  }

  not(): ISagaSpecification {
    return this._spec;
  }

  getInner(): ISagaSpecification {
    return this._spec;
  }
}
