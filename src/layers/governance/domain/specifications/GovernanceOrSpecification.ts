/**
 * GovernanceOrSpecification
 */

import { IGovernanceSpecification } from './IGovernanceSpecification';
import { GovernanceAndSpecification } from './GovernanceAndSpecification';
import { GovernanceNotSpecification } from './GovernanceNotSpecification';

export class GovernanceOrSpecification implements IGovernanceSpecification {
  private _specs: IGovernanceSpecification[];

  constructor(specs: IGovernanceSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IGovernanceSpecification): IGovernanceSpecification {
    return new GovernanceAndSpecification([this, other]);
  }

  or(other: IGovernanceSpecification): IGovernanceSpecification {
    return new GovernanceOrSpecification([...this._specs, other]);
  }

  not(): IGovernanceSpecification {
    return new GovernanceNotSpecification(this);
  }

  getSpecifications(): IGovernanceSpecification[] {
    return [...this._specs];
  }
}
