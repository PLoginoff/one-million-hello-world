/**
 * BatchProcessingOrSpecification
 */

import { IBatchProcessingSpecification } from './IBatchProcessingSpecification';
import { BatchProcessingAndSpecification } from './BatchProcessingAndSpecification';
import { BatchProcessingNotSpecification } from './BatchProcessingNotSpecification';

export class BatchProcessingOrSpecification implements IBatchProcessingSpecification {
  private _specs: IBatchProcessingSpecification[];

  constructor(specs: IBatchProcessingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBatchProcessingSpecification): IBatchProcessingSpecification {
    return new BatchProcessingAndSpecification([this, other]);
  }

  or(other: IBatchProcessingSpecification): IBatchProcessingSpecification {
    return new BatchProcessingOrSpecification([...this._specs, other]);
  }

  not(): IBatchProcessingSpecification {
    return new BatchProcessingNotSpecification(this);
  }

  getSpecifications(): IBatchProcessingSpecification[] {
    return [...this._specs];
  }
}
