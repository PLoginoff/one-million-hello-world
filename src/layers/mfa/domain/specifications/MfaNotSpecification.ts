/**
 * MfaNotSpecification
 */

import { IMfaSpecification } from './IMfaSpecification';
import { MfaAndSpecification } from './MfaAndSpecification';
import { MfaOrSpecification } from './MfaOrSpecification';

export class MfaNotSpecification implements IMfaSpecification {
  private _spec: IMfaSpecification;

  constructor(spec: IMfaSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IMfaSpecification): IMfaSpecification {
    return new MfaAndSpecification([this, other]);
  }

  or(other: IMfaSpecification): IMfaSpecification {
    return new MfaOrSpecification([this, other]);
  }

  not(): IMfaSpecification {
    return this._spec;
  }

  getInner(): IMfaSpecification {
    return this._spec;
  }
}
