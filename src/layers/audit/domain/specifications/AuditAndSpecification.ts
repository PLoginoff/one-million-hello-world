/**
 * AuditAndSpecification
 */

import { IAuditSpecification } from './IAuditSpecification';
import { AuditOrSpecification } from './AuditOrSpecification';
import { AuditNotSpecification } from './AuditNotSpecification';

export class AuditAndSpecification implements IAuditSpecification {
  private _specs: IAuditSpecification[];

  constructor(specs: IAuditSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IAuditSpecification): IAuditSpecification {
    return new AuditAndSpecification([...this._specs, other]);
  }

  or(other: IAuditSpecification): IAuditSpecification {
    return new AuditOrSpecification([this, other]);
  }

  not(): IAuditSpecification {
    return new AuditNotSpecification(this);
  }

  getSpecifications(): IAuditSpecification[] {
    return [...this._specs];
  }
}
