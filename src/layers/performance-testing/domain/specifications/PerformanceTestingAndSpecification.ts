/**
 * PerformanceTestingAndSpecification
 */

import { IPerformanceTestingSpecification } from './IPerformanceTestingSpecification';
import { PerformanceTestingOrSpecification } from './PerformanceTestingOrSpecification';
import { PerformanceTestingNotSpecification } from './PerformanceTestingNotSpecification';

export class PerformanceTestingAndSpecification implements IPerformanceTestingSpecification {
  private _specs: IPerformanceTestingSpecification[];

  constructor(specs: IPerformanceTestingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IPerformanceTestingSpecification): IPerformanceTestingSpecification {
    return new PerformanceTestingAndSpecification([...this._specs, other]);
  }

  or(other: IPerformanceTestingSpecification): IPerformanceTestingSpecification {
    return new PerformanceTestingOrSpecification([this, other]);
  }

  not(): IPerformanceTestingSpecification {
    return new PerformanceTestingNotSpecification(this);
  }

  getSpecifications(): IPerformanceTestingSpecification[] {
    return [...this._specs];
  }
}
