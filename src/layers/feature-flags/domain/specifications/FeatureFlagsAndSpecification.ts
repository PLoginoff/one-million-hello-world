/**
 * FeatureFlagsAndSpecification
 */

import { IFeatureFlagsSpecification } from './IFeatureFlagsSpecification';
import { FeatureFlagsOrSpecification } from './FeatureFlagsOrSpecification';
import { FeatureFlagsNotSpecification } from './FeatureFlagsNotSpecification';

export class FeatureFlagsAndSpecification implements IFeatureFlagsSpecification {
  private _specs: IFeatureFlagsSpecification[];

  constructor(specs: IFeatureFlagsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IFeatureFlagsSpecification): IFeatureFlagsSpecification {
    return new FeatureFlagsAndSpecification([...this._specs, other]);
  }

  or(other: IFeatureFlagsSpecification): IFeatureFlagsSpecification {
    return new FeatureFlagsOrSpecification([this, other]);
  }

  not(): IFeatureFlagsSpecification {
    return new FeatureFlagsNotSpecification(this);
  }

  getSpecifications(): IFeatureFlagsSpecification[] {
    return [...this._specs];
  }
}
