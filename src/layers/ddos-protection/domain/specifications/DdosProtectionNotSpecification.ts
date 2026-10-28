/**
 * DdosProtectionNotSpecification
 */

import { IDdosProtectionSpecification } from './IDdosProtectionSpecification';
import { DdosProtectionAndSpecification } from './DdosProtectionAndSpecification';
import { DdosProtectionOrSpecification } from './DdosProtectionOrSpecification';

export class DdosProtectionNotSpecification implements IDdosProtectionSpecification {
  private _spec: IDdosProtectionSpecification;

  constructor(spec: IDdosProtectionSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IDdosProtectionSpecification): IDdosProtectionSpecification {
    return new DdosProtectionAndSpecification([this, other]);
  }

  or(other: IDdosProtectionSpecification): IDdosProtectionSpecification {
    return new DdosProtectionOrSpecification([this, other]);
  }

  not(): IDdosProtectionSpecification {
    return this._spec;
  }

  getInner(): IDdosProtectionSpecification {
    return this._spec;
  }
}
