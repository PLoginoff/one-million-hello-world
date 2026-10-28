/**
 * RetryOrSpecification
 */

import { IRetrySpecification } from './IRetrySpecification';
import { RetryAndSpecification } from './RetryAndSpecification';
import { RetryNotSpecification } from './RetryNotSpecification';

export class RetryOrSpecification implements IRetrySpecification {
  private _specs: IRetrySpecification[];

  constructor(specs: IRetrySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRetrySpecification): IRetrySpecification {
    return new RetryAndSpecification([this, other]);
  }

  or(other: IRetrySpecification): IRetrySpecification {
    return new RetryOrSpecification([...this._specs, other]);
  }

  not(): IRetrySpecification {
    return new RetryNotSpecification(this);
  }

  getSpecifications(): IRetrySpecification[] {
    return [...this._specs];
  }
}
