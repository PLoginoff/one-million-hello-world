/**
 * SagaOrSpecification
 */

import { ISagaSpecification } from './ISagaSpecification';
import { SagaAndSpecification } from './SagaAndSpecification';
import { SagaNotSpecification } from './SagaNotSpecification';

export class SagaOrSpecification implements ISagaSpecification {
  private _specs: ISagaSpecification[];

  constructor(specs: ISagaSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISagaSpecification): ISagaSpecification {
    return new SagaAndSpecification([this, other]);
  }

  or(other: ISagaSpecification): ISagaSpecification {
    return new SagaOrSpecification([...this._specs, other]);
  }

  not(): ISagaSpecification {
    return new SagaNotSpecification(this);
  }

  getSpecifications(): ISagaSpecification[] {
    return [...this._specs];
  }
}
