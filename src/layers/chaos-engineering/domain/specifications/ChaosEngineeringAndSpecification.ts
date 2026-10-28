/**
 * ChaosEngineeringAndSpecification
 */

import { IChaosEngineeringSpecification } from './IChaosEngineeringSpecification';
import { ChaosEngineeringOrSpecification } from './ChaosEngineeringOrSpecification';
import { ChaosEngineeringNotSpecification } from './ChaosEngineeringNotSpecification';

export class ChaosEngineeringAndSpecification implements IChaosEngineeringSpecification {
  private _specs: IChaosEngineeringSpecification[];

  constructor(specs: IChaosEngineeringSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IChaosEngineeringSpecification): IChaosEngineeringSpecification {
    return new ChaosEngineeringAndSpecification([...this._specs, other]);
  }

  or(other: IChaosEngineeringSpecification): IChaosEngineeringSpecification {
    return new ChaosEngineeringOrSpecification([this, other]);
  }

  not(): IChaosEngineeringSpecification {
    return new ChaosEngineeringNotSpecification(this);
  }

  getSpecifications(): IChaosEngineeringSpecification[] {
    return [...this._specs];
  }
}
