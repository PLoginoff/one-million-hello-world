/**
 * DomainAndSpecification
 */

import { IDomainSpecification } from './IDomainSpecification';
import { DomainOrSpecification } from './DomainOrSpecification';
import { DomainNotSpecification } from './DomainNotSpecification';

export class DomainAndSpecification implements IDomainSpecification {
  private _specs: IDomainSpecification[];

  constructor(specs: IDomainSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDomainSpecification): IDomainSpecification {
    return new DomainAndSpecification([...this._specs, other]);
  }

  or(other: IDomainSpecification): IDomainSpecification {
    return new DomainOrSpecification([this, other]);
  }

  not(): IDomainSpecification {
    return new DomainNotSpecification(this);
  }

  getSpecifications(): IDomainSpecification[] {
    return [...this._specs];
  }
}
