/**
 * MfaOrSpecification
 */

import { IMfaSpecification } from './IMfaSpecification';
import { MfaAndSpecification } from './MfaAndSpecification';
import { MfaNotSpecification } from './MfaNotSpecification';

export class MfaOrSpecification implements IMfaSpecification {
  private _specs: IMfaSpecification[];

  constructor(specs: IMfaSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMfaSpecification): IMfaSpecification {
    return new MfaAndSpecification([this, other]);
  }

  or(other: IMfaSpecification): IMfaSpecification {
    return new MfaOrSpecification([...this._specs, other]);
  }

  not(): IMfaSpecification {
    return new MfaNotSpecification(this);
  }

  getSpecifications(): IMfaSpecification[] {
    return [...this._specs];
  }
}
