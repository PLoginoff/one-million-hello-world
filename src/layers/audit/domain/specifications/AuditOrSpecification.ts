/**
 * AuditOrSpecification
 */

import { IAuditSpecification } from './IAuditSpecification';
import { AuditAndSpecification } from './AuditAndSpecification';
import { AuditNotSpecification } from './AuditNotSpecification';

export class AuditOrSpecification implements IAuditSpecification {
  private _specs: IAuditSpecification[];

  constructor(specs: IAuditSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IAuditSpecification): IAuditSpecification {
    return new AuditAndSpecification([this, other]);
  }

  or(other: IAuditSpecification): IAuditSpecification {
    return new AuditOrSpecification([...this._specs, other]);
  }

  not(): IAuditSpecification {
    return new AuditNotSpecification(this);
  }

  getSpecifications(): IAuditSpecification[] {
    return [...this._specs];
  }
}
