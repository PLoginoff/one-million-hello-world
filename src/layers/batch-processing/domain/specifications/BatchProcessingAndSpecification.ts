/**
 * BatchProcessingAndSpecification
 */

import { IBatchProcessingSpecification } from './IBatchProcessingSpecification';
import { BatchProcessingOrSpecification } from './BatchProcessingOrSpecification';
import { BatchProcessingNotSpecification } from './BatchProcessingNotSpecification';

export class BatchProcessingAndSpecification implements IBatchProcessingSpecification {
  private _specs: IBatchProcessingSpecification[];

  constructor(specs: IBatchProcessingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBatchProcessingSpecification): IBatchProcessingSpecification {
    return new BatchProcessingAndSpecification([...this._specs, other]);
  }

  or(other: IBatchProcessingSpecification): IBatchProcessingSpecification {
    return new BatchProcessingOrSpecification([this, other]);
  }

  not(): IBatchProcessingSpecification {
    return new BatchProcessingNotSpecification(this);
  }

  getSpecifications(): IBatchProcessingSpecification[] {
    return [...this._specs];
  }
}
