/**
 * CircuitBreakerAndSpecification
 */

import { ICircuitBreakerSpecification } from './ICircuitBreakerSpecification';
import { CircuitBreakerOrSpecification } from './CircuitBreakerOrSpecification';
import { CircuitBreakerNotSpecification } from './CircuitBreakerNotSpecification';

export class CircuitBreakerAndSpecification implements ICircuitBreakerSpecification {
  private _specs: ICircuitBreakerSpecification[];

  constructor(specs: ICircuitBreakerSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICircuitBreakerSpecification): ICircuitBreakerSpecification {
    return new CircuitBreakerAndSpecification([...this._specs, other]);
  }

  or(other: ICircuitBreakerSpecification): ICircuitBreakerSpecification {
    return new CircuitBreakerOrSpecification([this, other]);
  }

  not(): ICircuitBreakerSpecification {
    return new CircuitBreakerNotSpecification(this);
  }

  getSpecifications(): ICircuitBreakerSpecification[] {
    return [...this._specs];
  }
}
