/**
 * DdosProtectionOrSpecification
 */

import { IDdosProtectionSpecification } from './IDdosProtectionSpecification';
import { DdosProtectionAndSpecification } from './DdosProtectionAndSpecification';
import { DdosProtectionNotSpecification } from './DdosProtectionNotSpecification';

export class DdosProtectionOrSpecification implements IDdosProtectionSpecification {
  private _specs: IDdosProtectionSpecification[];

  constructor(specs: IDdosProtectionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDdosProtectionSpecification): IDdosProtectionSpecification {
    return new DdosProtectionAndSpecification([this, other]);
  }

  or(other: IDdosProtectionSpecification): IDdosProtectionSpecification {
    return new DdosProtectionOrSpecification([...this._specs, other]);
  }

  not(): IDdosProtectionSpecification {
    return new DdosProtectionNotSpecification(this);
  }

  getSpecifications(): IDdosProtectionSpecification[] {
    return [...this._specs];
  }
}
