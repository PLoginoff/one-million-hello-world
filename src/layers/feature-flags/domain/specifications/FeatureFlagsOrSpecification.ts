/**
 * FeatureFlagsOrSpecification
 */

import { IFeatureFlagsSpecification } from './IFeatureFlagsSpecification';
import { FeatureFlagsAndSpecification } from './FeatureFlagsAndSpecification';
import { FeatureFlagsNotSpecification } from './FeatureFlagsNotSpecification';

export class FeatureFlagsOrSpecification implements IFeatureFlagsSpecification {
  private _specs: IFeatureFlagsSpecification[];

  constructor(specs: IFeatureFlagsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IFeatureFlagsSpecification): IFeatureFlagsSpecification {
    return new FeatureFlagsAndSpecification([this, other]);
  }

  or(other: IFeatureFlagsSpecification): IFeatureFlagsSpecification {
    return new FeatureFlagsOrSpecification([...this._specs, other]);
  }

  not(): IFeatureFlagsSpecification {
    return new FeatureFlagsNotSpecification(this);
  }

  getSpecifications(): IFeatureFlagsSpecification[] {
    return [...this._specs];
  }
}
