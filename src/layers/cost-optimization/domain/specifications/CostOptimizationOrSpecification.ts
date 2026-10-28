/**
 * CostOptimizationOrSpecification
 */

import { ICostOptimizationSpecification } from './ICostOptimizationSpecification';
import { CostOptimizationAndSpecification } from './CostOptimizationAndSpecification';
import { CostOptimizationNotSpecification } from './CostOptimizationNotSpecification';

export class CostOptimizationOrSpecification implements ICostOptimizationSpecification {
  private _specs: ICostOptimizationSpecification[];

  constructor(specs: ICostOptimizationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICostOptimizationSpecification): ICostOptimizationSpecification {
    return new CostOptimizationAndSpecification([this, other]);
  }

  or(other: ICostOptimizationSpecification): ICostOptimizationSpecification {
    return new CostOptimizationOrSpecification([...this._specs, other]);
  }

  not(): ICostOptimizationSpecification {
    return new CostOptimizationNotSpecification(this);
  }

  getSpecifications(): ICostOptimizationSpecification[] {
    return [...this._specs];
  }
}
