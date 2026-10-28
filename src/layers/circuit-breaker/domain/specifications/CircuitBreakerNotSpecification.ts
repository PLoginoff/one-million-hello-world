/**
 * CircuitBreakerNotSpecification
 */

import { ICircuitBreakerSpecification } from './ICircuitBreakerSpecification';
import { CircuitBreakerAndSpecification } from './CircuitBreakerAndSpecification';
import { CircuitBreakerOrSpecification } from './CircuitBreakerOrSpecification';

export class CircuitBreakerNotSpecification implements ICircuitBreakerSpecification {
  private _spec: ICircuitBreakerSpecification;

  constructor(spec: ICircuitBreakerSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ICircuitBreakerSpecification): ICircuitBreakerSpecification {
    return new CircuitBreakerAndSpecification([this, other]);
  }

  or(other: ICircuitBreakerSpecification): ICircuitBreakerSpecification {
    return new CircuitBreakerOrSpecification([this, other]);
  }

  not(): ICircuitBreakerSpecification {
    return this._spec;
  }

  getInner(): ICircuitBreakerSpecification {
    return this._spec;
  }
}
