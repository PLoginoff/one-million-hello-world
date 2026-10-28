/**
 * MlFeatureStoreOrSpecification
 */

import { IMlFeatureStoreSpecification } from './IMlFeatureStoreSpecification';
import { MlFeatureStoreAndSpecification } from './MlFeatureStoreAndSpecification';
import { MlFeatureStoreNotSpecification } from './MlFeatureStoreNotSpecification';

export class MlFeatureStoreOrSpecification implements IMlFeatureStoreSpecification {
  private _specs: IMlFeatureStoreSpecification[];

  constructor(specs: IMlFeatureStoreSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMlFeatureStoreSpecification): IMlFeatureStoreSpecification {
    return new MlFeatureStoreAndSpecification([this, other]);
  }

  or(other: IMlFeatureStoreSpecification): IMlFeatureStoreSpecification {
    return new MlFeatureStoreOrSpecification([...this._specs, other]);
  }

  not(): IMlFeatureStoreSpecification {
    return new MlFeatureStoreNotSpecification(this);
  }

  getSpecifications(): IMlFeatureStoreSpecification[] {
    return [...this._specs];
  }
}
