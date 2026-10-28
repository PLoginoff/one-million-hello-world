/**
 * DomainOrSpecification
 */

import { IDomainSpecification } from './IDomainSpecification';
import { DomainAndSpecification } from './DomainAndSpecification';
import { DomainNotSpecification } from './DomainNotSpecification';

export class DomainOrSpecification implements IDomainSpecification {
  private _specs: IDomainSpecification[];

  constructor(specs: IDomainSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDomainSpecification): IDomainSpecification {
    return new DomainAndSpecification([this, other]);
  }

  or(other: IDomainSpecification): IDomainSpecification {
    return new DomainOrSpecification([...this._specs, other]);
  }

  not(): IDomainSpecification {
    return new DomainNotSpecification(this);
  }

  getSpecifications(): IDomainSpecification[] {
    return [...this._specs];
  }
}
