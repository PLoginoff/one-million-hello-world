/**
 * GovernanceAndSpecification
 */

import { IGovernanceSpecification } from './IGovernanceSpecification';
import { GovernanceOrSpecification } from './GovernanceOrSpecification';
import { GovernanceNotSpecification } from './GovernanceNotSpecification';

export class GovernanceAndSpecification implements IGovernanceSpecification {
  private _specs: IGovernanceSpecification[];

  constructor(specs: IGovernanceSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IGovernanceSpecification): IGovernanceSpecification {
    return new GovernanceAndSpecification([...this._specs, other]);
  }

  or(other: IGovernanceSpecification): IGovernanceSpecification {
    return new GovernanceOrSpecification([this, other]);
  }

  not(): IGovernanceSpecification {
    return new GovernanceNotSpecification(this);
  }

  getSpecifications(): IGovernanceSpecification[] {
    return [...this._specs];
  }
}
