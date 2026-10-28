/**
 * MlFeatureStoreAndSpecification
 */

import { IMlFeatureStoreSpecification } from './IMlFeatureStoreSpecification';
import { MlFeatureStoreOrSpecification } from './MlFeatureStoreOrSpecification';
import { MlFeatureStoreNotSpecification } from './MlFeatureStoreNotSpecification';

export class MlFeatureStoreAndSpecification implements IMlFeatureStoreSpecification {
  private _specs: IMlFeatureStoreSpecification[];

  constructor(specs: IMlFeatureStoreSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMlFeatureStoreSpecification): IMlFeatureStoreSpecification {
    return new MlFeatureStoreAndSpecification([...this._specs, other]);
  }

  or(other: IMlFeatureStoreSpecification): IMlFeatureStoreSpecification {
    return new MlFeatureStoreOrSpecification([this, other]);
  }

  not(): IMlFeatureStoreSpecification {
    return new MlFeatureStoreNotSpecification(this);
  }

  getSpecifications(): IMlFeatureStoreSpecification[] {
    return [...this._specs];
  }
}
