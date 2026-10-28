/**
 * ObservabilityOrSpecification
 */

import { IObservabilitySpecification } from './IObservabilitySpecification';
import { ObservabilityAndSpecification } from './ObservabilityAndSpecification';
import { ObservabilityNotSpecification } from './ObservabilityNotSpecification';

export class ObservabilityOrSpecification implements IObservabilitySpecification {
  private _specs: IObservabilitySpecification[];

  constructor(specs: IObservabilitySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IObservabilitySpecification): IObservabilitySpecification {
    return new ObservabilityAndSpecification([this, other]);
  }

  or(other: IObservabilitySpecification): IObservabilitySpecification {
    return new ObservabilityOrSpecification([...this._specs, other]);
  }

  not(): IObservabilitySpecification {
    return new ObservabilityNotSpecification(this);
  }

  getSpecifications(): IObservabilitySpecification[] {
    return [...this._specs];
  }
}
