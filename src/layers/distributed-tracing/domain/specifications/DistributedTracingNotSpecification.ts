/**
 * DistributedTracingNotSpecification
 */

import { IDistributedTracingSpecification } from './IDistributedTracingSpecification';
import { DistributedTracingAndSpecification } from './DistributedTracingAndSpecification';
import { DistributedTracingOrSpecification } from './DistributedTracingOrSpecification';

export class DistributedTracingNotSpecification implements IDistributedTracingSpecification {
  private _spec: IDistributedTracingSpecification;

  constructor(spec: IDistributedTracingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IDistributedTracingSpecification): IDistributedTracingSpecification {
    return new DistributedTracingAndSpecification([this, other]);
  }

  or(other: IDistributedTracingSpecification): IDistributedTracingSpecification {
    return new DistributedTracingOrSpecification([this, other]);
  }

  not(): IDistributedTracingSpecification {
    return this._spec;
  }

  getInner(): IDistributedTracingSpecification {
    return this._spec;
  }
}
