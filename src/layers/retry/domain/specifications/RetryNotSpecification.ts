/**
 * RetryNotSpecification
 */

import { IRetrySpecification } from './IRetrySpecification';
import { RetryAndSpecification } from './RetryAndSpecification';
import { RetryOrSpecification } from './RetryOrSpecification';

export class RetryNotSpecification implements IRetrySpecification {
  private _spec: IRetrySpecification;

  constructor(spec: IRetrySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IRetrySpecification): IRetrySpecification {
    return new RetryAndSpecification([this, other]);
  }

  or(other: IRetrySpecification): IRetrySpecification {
    return new RetryOrSpecification([this, other]);
  }

  not(): IRetrySpecification {
    return this._spec;
  }

  getInner(): IRetrySpecification {
    return this._spec;
  }
}
