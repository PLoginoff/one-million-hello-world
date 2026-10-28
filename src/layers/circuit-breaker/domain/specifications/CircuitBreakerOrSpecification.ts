/**
 * CircuitBreakerOrSpecification
 */

import { ICircuitBreakerSpecification } from './ICircuitBreakerSpecification';
import { CircuitBreakerAndSpecification } from './CircuitBreakerAndSpecification';
import { CircuitBreakerNotSpecification } from './CircuitBreakerNotSpecification';

export class CircuitBreakerOrSpecification implements ICircuitBreakerSpecification {
  private _specs: ICircuitBreakerSpecification[];

  constructor(specs: ICircuitBreakerSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICircuitBreakerSpecification): ICircuitBreakerSpecification {
    return new CircuitBreakerAndSpecification([this, other]);
  }

  or(other: ICircuitBreakerSpecification): ICircuitBreakerSpecification {
    return new CircuitBreakerOrSpecification([...this._specs, other]);
  }

  not(): ICircuitBreakerSpecification {
    return new CircuitBreakerNotSpecification(this);
  }

  getSpecifications(): ICircuitBreakerSpecification[] {
    return [...this._specs];
  }
}
