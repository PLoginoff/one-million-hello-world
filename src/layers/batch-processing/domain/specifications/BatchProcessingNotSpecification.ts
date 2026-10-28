/**
 * BatchProcessingNotSpecification
 */

import { IBatchProcessingSpecification } from './IBatchProcessingSpecification';
import { BatchProcessingAndSpecification } from './BatchProcessingAndSpecification';
import { BatchProcessingOrSpecification } from './BatchProcessingOrSpecification';

export class BatchProcessingNotSpecification implements IBatchProcessingSpecification {
  private _spec: IBatchProcessingSpecification;

  constructor(spec: IBatchProcessingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IBatchProcessingSpecification): IBatchProcessingSpecification {
    return new BatchProcessingAndSpecification([this, other]);
  }

  or(other: IBatchProcessingSpecification): IBatchProcessingSpecification {
    return new BatchProcessingOrSpecification([this, other]);
  }

  not(): IBatchProcessingSpecification {
    return this._spec;
  }

  getInner(): IBatchProcessingSpecification {
    return this._spec;
  }
}
