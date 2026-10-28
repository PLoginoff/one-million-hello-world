/**
 * DisasterRecoveryNotSpecification
 */

import { IDisasterRecoverySpecification } from './IDisasterRecoverySpecification';
import { DisasterRecoveryAndSpecification } from './DisasterRecoveryAndSpecification';
import { DisasterRecoveryOrSpecification } from './DisasterRecoveryOrSpecification';

export class DisasterRecoveryNotSpecification implements IDisasterRecoverySpecification {
  private _spec: IDisasterRecoverySpecification;

  constructor(spec: IDisasterRecoverySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IDisasterRecoverySpecification): IDisasterRecoverySpecification {
    return new DisasterRecoveryAndSpecification([this, other]);
  }

  or(other: IDisasterRecoverySpecification): IDisasterRecoverySpecification {
    return new DisasterRecoveryOrSpecification([this, other]);
  }

  not(): IDisasterRecoverySpecification {
    return this._spec;
  }

  getInner(): IDisasterRecoverySpecification {
    return this._spec;
  }
}
