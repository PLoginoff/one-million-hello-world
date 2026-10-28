/**
 * MfaAndSpecification
 */

import { IMfaSpecification } from './IMfaSpecification';
import { MfaOrSpecification } from './MfaOrSpecification';
import { MfaNotSpecification } from './MfaNotSpecification';

export class MfaAndSpecification implements IMfaSpecification {
  private _specs: IMfaSpecification[];

  constructor(specs: IMfaSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMfaSpecification): IMfaSpecification {
    return new MfaAndSpecification([...this._specs, other]);
  }

  or(other: IMfaSpecification): IMfaSpecification {
    return new MfaOrSpecification([this, other]);
  }

  not(): IMfaSpecification {
    return new MfaNotSpecification(this);
  }

  getSpecifications(): IMfaSpecification[] {
    return [...this._specs];
  }
}
