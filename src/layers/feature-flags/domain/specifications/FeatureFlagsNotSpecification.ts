/**
 * FeatureFlagsNotSpecification
 */

import { IFeatureFlagsSpecification } from './IFeatureFlagsSpecification';
import { FeatureFlagsAndSpecification } from './FeatureFlagsAndSpecification';
import { FeatureFlagsOrSpecification } from './FeatureFlagsOrSpecification';

export class FeatureFlagsNotSpecification implements IFeatureFlagsSpecification {
  private _spec: IFeatureFlagsSpecification;

  constructor(spec: IFeatureFlagsSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IFeatureFlagsSpecification): IFeatureFlagsSpecification {
    return new FeatureFlagsAndSpecification([this, other]);
  }

  or(other: IFeatureFlagsSpecification): IFeatureFlagsSpecification {
    return new FeatureFlagsOrSpecification([this, other]);
  }

  not(): IFeatureFlagsSpecification {
    return this._spec;
  }

  getInner(): IFeatureFlagsSpecification {
    return this._spec;
  }
}
