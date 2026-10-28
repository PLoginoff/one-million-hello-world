/**
 * SchedulingNotSpecification
 */

import { ISchedulingSpecification } from './ISchedulingSpecification';
import { SchedulingAndSpecification } from './SchedulingAndSpecification';
import { SchedulingOrSpecification } from './SchedulingOrSpecification';

export class SchedulingNotSpecification implements ISchedulingSpecification {
  private _spec: ISchedulingSpecification;

  constructor(spec: ISchedulingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISchedulingSpecification): ISchedulingSpecification {
    return new SchedulingAndSpecification([this, other]);
  }

  or(other: ISchedulingSpecification): ISchedulingSpecification {
    return new SchedulingOrSpecification([this, other]);
  }

  not(): ISchedulingSpecification {
    return this._spec;
  }

  getInner(): ISchedulingSpecification {
    return this._spec;
  }
}
