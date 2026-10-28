/**
 * ObservabilityAndSpecification
 */

import { IObservabilitySpecification } from './IObservabilitySpecification';
import { ObservabilityOrSpecification } from './ObservabilityOrSpecification';
import { ObservabilityNotSpecification } from './ObservabilityNotSpecification';

export class ObservabilityAndSpecification implements IObservabilitySpecification {
  private _specs: IObservabilitySpecification[];

  constructor(specs: IObservabilitySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IObservabilitySpecification): IObservabilitySpecification {
    return new ObservabilityAndSpecification([...this._specs, other]);
  }

  or(other: IObservabilitySpecification): IObservabilitySpecification {
    return new ObservabilityOrSpecification([this, other]);
  }

  not(): IObservabilitySpecification {
    return new ObservabilityNotSpecification(this);
  }

  getSpecifications(): IObservabilitySpecification[] {
    return [...this._specs];
  }
}
