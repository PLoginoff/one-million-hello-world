/**
 * SagaAndSpecification
 */

import { ISagaSpecification } from './ISagaSpecification';
import { SagaOrSpecification } from './SagaOrSpecification';
import { SagaNotSpecification } from './SagaNotSpecification';

export class SagaAndSpecification implements ISagaSpecification {
  private _specs: ISagaSpecification[];

  constructor(specs: ISagaSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISagaSpecification): ISagaSpecification {
    return new SagaAndSpecification([...this._specs, other]);
  }

  or(other: ISagaSpecification): ISagaSpecification {
    return new SagaOrSpecification([this, other]);
  }

  not(): ISagaSpecification {
    return new SagaNotSpecification(this);
  }

  getSpecifications(): ISagaSpecification[] {
    return [...this._specs];
  }
}
