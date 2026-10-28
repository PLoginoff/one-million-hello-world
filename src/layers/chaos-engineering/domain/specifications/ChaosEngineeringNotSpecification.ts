/**
 * ChaosEngineeringNotSpecification
 */

import { IChaosEngineeringSpecification } from './IChaosEngineeringSpecification';
import { ChaosEngineeringAndSpecification } from './ChaosEngineeringAndSpecification';
import { ChaosEngineeringOrSpecification } from './ChaosEngineeringOrSpecification';

export class ChaosEngineeringNotSpecification implements IChaosEngineeringSpecification {
  private _spec: IChaosEngineeringSpecification;

  constructor(spec: IChaosEngineeringSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IChaosEngineeringSpecification): IChaosEngineeringSpecification {
    return new ChaosEngineeringAndSpecification([this, other]);
  }

  or(other: IChaosEngineeringSpecification): IChaosEngineeringSpecification {
    return new ChaosEngineeringOrSpecification([this, other]);
  }

  not(): IChaosEngineeringSpecification {
    return this._spec;
  }

  getInner(): IChaosEngineeringSpecification {
    return this._spec;
  }
}
