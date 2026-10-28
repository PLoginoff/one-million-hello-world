/**
 * DistributedTracingOrSpecification
 */

import { IDistributedTracingSpecification } from './IDistributedTracingSpecification';
import { DistributedTracingAndSpecification } from './DistributedTracingAndSpecification';
import { DistributedTracingNotSpecification } from './DistributedTracingNotSpecification';

export class DistributedTracingOrSpecification implements IDistributedTracingSpecification {
  private _specs: IDistributedTracingSpecification[];

  constructor(specs: IDistributedTracingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDistributedTracingSpecification): IDistributedTracingSpecification {
    return new DistributedTracingAndSpecification([this, other]);
  }

  or(other: IDistributedTracingSpecification): IDistributedTracingSpecification {
    return new DistributedTracingOrSpecification([...this._specs, other]);
  }

  not(): IDistributedTracingSpecification {
    return new DistributedTracingNotSpecification(this);
  }

  getSpecifications(): IDistributedTracingSpecification[] {
    return [...this._specs];
  }
}
