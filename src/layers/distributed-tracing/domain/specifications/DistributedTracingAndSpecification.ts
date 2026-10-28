/**
 * DistributedTracingAndSpecification
 */

import { IDistributedTracingSpecification } from './IDistributedTracingSpecification';
import { DistributedTracingOrSpecification } from './DistributedTracingOrSpecification';
import { DistributedTracingNotSpecification } from './DistributedTracingNotSpecification';

export class DistributedTracingAndSpecification implements IDistributedTracingSpecification {
  private _specs: IDistributedTracingSpecification[];

  constructor(specs: IDistributedTracingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDistributedTracingSpecification): IDistributedTracingSpecification {
    return new DistributedTracingAndSpecification([...this._specs, other]);
  }

  or(other: IDistributedTracingSpecification): IDistributedTracingSpecification {
    return new DistributedTracingOrSpecification([this, other]);
  }

  not(): IDistributedTracingSpecification {
    return new DistributedTracingNotSpecification(this);
  }

  getSpecifications(): IDistributedTracingSpecification[] {
    return [...this._specs];
  }
}
