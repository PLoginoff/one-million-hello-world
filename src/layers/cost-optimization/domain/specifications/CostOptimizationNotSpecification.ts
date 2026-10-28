/**
 * CostOptimizationNotSpecification
 */

import { ICostOptimizationSpecification } from './ICostOptimizationSpecification';
import { CostOptimizationAndSpecification } from './CostOptimizationAndSpecification';
import { CostOptimizationOrSpecification } from './CostOptimizationOrSpecification';

export class CostOptimizationNotSpecification implements ICostOptimizationSpecification {
  private _spec: ICostOptimizationSpecification;

  constructor(spec: ICostOptimizationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ICostOptimizationSpecification): ICostOptimizationSpecification {
    return new CostOptimizationAndSpecification([this, other]);
  }

  or(other: ICostOptimizationSpecification): ICostOptimizationSpecification {
    return new CostOptimizationOrSpecification([this, other]);
  }

  not(): ICostOptimizationSpecification {
    return this._spec;
  }

  getInner(): ICostOptimizationSpecification {
    return this._spec;
  }
}
