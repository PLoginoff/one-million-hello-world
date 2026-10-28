/**
 * MlFeatureStoreNotSpecification
 */

import { IMlFeatureStoreSpecification } from './IMlFeatureStoreSpecification';
import { MlFeatureStoreAndSpecification } from './MlFeatureStoreAndSpecification';
import { MlFeatureStoreOrSpecification } from './MlFeatureStoreOrSpecification';

export class MlFeatureStoreNotSpecification implements IMlFeatureStoreSpecification {
  private _spec: IMlFeatureStoreSpecification;

  constructor(spec: IMlFeatureStoreSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IMlFeatureStoreSpecification): IMlFeatureStoreSpecification {
    return new MlFeatureStoreAndSpecification([this, other]);
  }

  or(other: IMlFeatureStoreSpecification): IMlFeatureStoreSpecification {
    return new MlFeatureStoreOrSpecification([this, other]);
  }

  not(): IMlFeatureStoreSpecification {
    return this._spec;
  }

  getInner(): IMlFeatureStoreSpecification {
    return this._spec;
  }
}
