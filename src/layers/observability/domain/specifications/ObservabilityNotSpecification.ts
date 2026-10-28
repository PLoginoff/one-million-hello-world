/**
 * ObservabilityNotSpecification
 */

import { IObservabilitySpecification } from './IObservabilitySpecification';
import { ObservabilityAndSpecification } from './ObservabilityAndSpecification';
import { ObservabilityOrSpecification } from './ObservabilityOrSpecification';

export class ObservabilityNotSpecification implements IObservabilitySpecification {
  private _spec: IObservabilitySpecification;

  constructor(spec: IObservabilitySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IObservabilitySpecification): IObservabilitySpecification {
    return new ObservabilityAndSpecification([this, other]);
  }

  or(other: IObservabilitySpecification): IObservabilitySpecification {
    return new ObservabilityOrSpecification([this, other]);
  }

  not(): IObservabilitySpecification {
    return this._spec;
  }

  getInner(): IObservabilitySpecification {
    return this._spec;
  }
}
