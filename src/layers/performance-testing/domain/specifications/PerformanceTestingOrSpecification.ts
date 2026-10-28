/**
 * PerformanceTestingOrSpecification
 */

import { IPerformanceTestingSpecification } from './IPerformanceTestingSpecification';
import { PerformanceTestingAndSpecification } from './PerformanceTestingAndSpecification';
import { PerformanceTestingNotSpecification } from './PerformanceTestingNotSpecification';

export class PerformanceTestingOrSpecification implements IPerformanceTestingSpecification {
  private _specs: IPerformanceTestingSpecification[];

  constructor(specs: IPerformanceTestingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IPerformanceTestingSpecification): IPerformanceTestingSpecification {
    return new PerformanceTestingAndSpecification([this, other]);
  }

  or(other: IPerformanceTestingSpecification): IPerformanceTestingSpecification {
    return new PerformanceTestingOrSpecification([...this._specs, other]);
  }

  not(): IPerformanceTestingSpecification {
    return new PerformanceTestingNotSpecification(this);
  }

  getSpecifications(): IPerformanceTestingSpecification[] {
    return [...this._specs];
  }
}
