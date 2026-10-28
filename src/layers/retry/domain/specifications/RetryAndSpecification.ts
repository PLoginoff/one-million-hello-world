/**
 * RetryAndSpecification
 */

import { IRetrySpecification } from './IRetrySpecification';
import { RetryOrSpecification } from './RetryOrSpecification';
import { RetryNotSpecification } from './RetryNotSpecification';

export class RetryAndSpecification implements IRetrySpecification {
  private _specs: IRetrySpecification[];

  constructor(specs: IRetrySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRetrySpecification): IRetrySpecification {
    return new RetryAndSpecification([...this._specs, other]);
  }

  or(other: IRetrySpecification): IRetrySpecification {
    return new RetryOrSpecification([this, other]);
  }

  not(): IRetrySpecification {
    return new RetryNotSpecification(this);
  }

  getSpecifications(): IRetrySpecification[] {
    return [...this._specs];
  }
}
