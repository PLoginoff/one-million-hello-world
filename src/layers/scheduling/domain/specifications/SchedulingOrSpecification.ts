/**
 * SchedulingOrSpecification
 */

import { ISchedulingSpecification } from './ISchedulingSpecification';
import { SchedulingAndSpecification } from './SchedulingAndSpecification';
import { SchedulingNotSpecification } from './SchedulingNotSpecification';

export class SchedulingOrSpecification implements ISchedulingSpecification {
  private _specs: ISchedulingSpecification[];

  constructor(specs: ISchedulingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISchedulingSpecification): ISchedulingSpecification {
    return new SchedulingAndSpecification([this, other]);
  }

  or(other: ISchedulingSpecification): ISchedulingSpecification {
    return new SchedulingOrSpecification([...this._specs, other]);
  }

  not(): ISchedulingSpecification {
    return new SchedulingNotSpecification(this);
  }

  getSpecifications(): ISchedulingSpecification[] {
    return [...this._specs];
  }
}
