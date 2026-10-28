/**
 * AuditNotSpecification
 */

import { IAuditSpecification } from './IAuditSpecification';
import { AuditAndSpecification } from './AuditAndSpecification';
import { AuditOrSpecification } from './AuditOrSpecification';

export class AuditNotSpecification implements IAuditSpecification {
  private _spec: IAuditSpecification;

  constructor(spec: IAuditSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IAuditSpecification): IAuditSpecification {
    return new AuditAndSpecification([this, other]);
  }

  or(other: IAuditSpecification): IAuditSpecification {
    return new AuditOrSpecification([this, other]);
  }

  not(): IAuditSpecification {
    return this._spec;
  }

  getInner(): IAuditSpecification {
    return this._spec;
  }
}
