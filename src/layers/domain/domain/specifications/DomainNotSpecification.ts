/**
 * DomainNotSpecification
 */

import { IDomainSpecification } from './IDomainSpecification';
import { DomainAndSpecification } from './DomainAndSpecification';
import { DomainOrSpecification } from './DomainOrSpecification';

export class DomainNotSpecification implements IDomainSpecification {
  private _spec: IDomainSpecification;

  constructor(spec: IDomainSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IDomainSpecification): IDomainSpecification {
    return new DomainAndSpecification([this, other]);
  }

  or(other: IDomainSpecification): IDomainSpecification {
    return new DomainOrSpecification([this, other]);
  }

  not(): IDomainSpecification {
    return this._spec;
  }

  getInner(): IDomainSpecification {
    return this._spec;
  }
}
