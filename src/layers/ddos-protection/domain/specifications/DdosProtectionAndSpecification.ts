/**
 * DdosProtectionAndSpecification
 */

import { IDdosProtectionSpecification } from './IDdosProtectionSpecification';
import { DdosProtectionOrSpecification } from './DdosProtectionOrSpecification';
import { DdosProtectionNotSpecification } from './DdosProtectionNotSpecification';

export class DdosProtectionAndSpecification implements IDdosProtectionSpecification {
  private _specs: IDdosProtectionSpecification[];

  constructor(specs: IDdosProtectionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDdosProtectionSpecification): IDdosProtectionSpecification {
    return new DdosProtectionAndSpecification([...this._specs, other]);
  }

  or(other: IDdosProtectionSpecification): IDdosProtectionSpecification {
    return new DdosProtectionOrSpecification([this, other]);
  }

  not(): IDdosProtectionSpecification {
    return new DdosProtectionNotSpecification(this);
  }

  getSpecifications(): IDdosProtectionSpecification[] {
    return [...this._specs];
  }
}
