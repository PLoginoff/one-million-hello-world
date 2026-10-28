/**
 * CostOptimizationAndSpecification
 */

import { ICostOptimizationSpecification } from './ICostOptimizationSpecification';
import { CostOptimizationOrSpecification } from './CostOptimizationOrSpecification';
import { CostOptimizationNotSpecification } from './CostOptimizationNotSpecification';

export class CostOptimizationAndSpecification implements ICostOptimizationSpecification {
  private _specs: ICostOptimizationSpecification[];

  constructor(specs: ICostOptimizationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICostOptimizationSpecification): ICostOptimizationSpecification {
    return new CostOptimizationAndSpecification([...this._specs, other]);
  }

  or(other: ICostOptimizationSpecification): ICostOptimizationSpecification {
    return new CostOptimizationOrSpecification([this, other]);
  }

  not(): ICostOptimizationSpecification {
    return new CostOptimizationNotSpecification(this);
  }

  getSpecifications(): ICostOptimizationSpecification[] {
    return [...this._specs];
  }
}
