/**
 * GovernanceNotSpecification
 */

import { IGovernanceSpecification } from './IGovernanceSpecification';
import { GovernanceAndSpecification } from './GovernanceAndSpecification';
import { GovernanceOrSpecification } from './GovernanceOrSpecification';

export class GovernanceNotSpecification implements IGovernanceSpecification {
  private _spec: IGovernanceSpecification;

  constructor(spec: IGovernanceSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IGovernanceSpecification): IGovernanceSpecification {
    return new GovernanceAndSpecification([this, other]);
  }

  or(other: IGovernanceSpecification): IGovernanceSpecification {
    return new GovernanceOrSpecification([this, other]);
  }

  not(): IGovernanceSpecification {
    return this._spec;
  }

  getInner(): IGovernanceSpecification {
    return this._spec;
  }
}
