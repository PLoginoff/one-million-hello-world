/**
 * SchedulingAndSpecification
 */

import { ISchedulingSpecification } from './ISchedulingSpecification';
import { SchedulingOrSpecification } from './SchedulingOrSpecification';
import { SchedulingNotSpecification } from './SchedulingNotSpecification';

export class SchedulingAndSpecification implements ISchedulingSpecification {
  private _specs: ISchedulingSpecification[];

  constructor(specs: ISchedulingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISchedulingSpecification): ISchedulingSpecification {
    return new SchedulingAndSpecification([...this._specs, other]);
  }

  or(other: ISchedulingSpecification): ISchedulingSpecification {
    return new SchedulingOrSpecification([this, other]);
  }

  not(): ISchedulingSpecification {
    return new SchedulingNotSpecification(this);
  }

  getSpecifications(): ISchedulingSpecification[] {
    return [...this._specs];
  }
}
