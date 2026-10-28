/**
 * PerformanceTestingNotSpecification
 */

import { IPerformanceTestingSpecification } from './IPerformanceTestingSpecification';
import { PerformanceTestingAndSpecification } from './PerformanceTestingAndSpecification';
import { PerformanceTestingOrSpecification } from './PerformanceTestingOrSpecification';

export class PerformanceTestingNotSpecification implements IPerformanceTestingSpecification {
  private _spec: IPerformanceTestingSpecification;

  constructor(spec: IPerformanceTestingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IPerformanceTestingSpecification): IPerformanceTestingSpecification {
    return new PerformanceTestingAndSpecification([this, other]);
  }

  or(other: IPerformanceTestingSpecification): IPerformanceTestingSpecification {
    return new PerformanceTestingOrSpecification([this, other]);
  }

  not(): IPerformanceTestingSpecification {
    return this._spec;
  }

  getInner(): IPerformanceTestingSpecification {
    return this._spec;
  }
}
