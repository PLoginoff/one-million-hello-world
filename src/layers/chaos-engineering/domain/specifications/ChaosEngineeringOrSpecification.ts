/**
 * ChaosEngineeringOrSpecification
 */

import { IChaosEngineeringSpecification } from './IChaosEngineeringSpecification';
import { ChaosEngineeringAndSpecification } from './ChaosEngineeringAndSpecification';
import { ChaosEngineeringNotSpecification } from './ChaosEngineeringNotSpecification';

export class ChaosEngineeringOrSpecification implements IChaosEngineeringSpecification {
  private _specs: IChaosEngineeringSpecification[];

  constructor(specs: IChaosEngineeringSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IChaosEngineeringSpecification): IChaosEngineeringSpecification {
    return new ChaosEngineeringAndSpecification([this, other]);
  }

  or(other: IChaosEngineeringSpecification): IChaosEngineeringSpecification {
    return new ChaosEngineeringOrSpecification([...this._specs, other]);
  }

  not(): IChaosEngineeringSpecification {
    return new ChaosEngineeringNotSpecification(this);
  }

  getSpecifications(): IChaosEngineeringSpecification[] {
    return [...this._specs];
  }
}
