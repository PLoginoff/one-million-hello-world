/**
 * DisasterRecoveryOrSpecification
 */

import { IDisasterRecoverySpecification } from './IDisasterRecoverySpecification';
import { DisasterRecoveryAndSpecification } from './DisasterRecoveryAndSpecification';
import { DisasterRecoveryNotSpecification } from './DisasterRecoveryNotSpecification';

export class DisasterRecoveryOrSpecification implements IDisasterRecoverySpecification {
  private _specs: IDisasterRecoverySpecification[];

  constructor(specs: IDisasterRecoverySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDisasterRecoverySpecification): IDisasterRecoverySpecification {
    return new DisasterRecoveryAndSpecification([this, other]);
  }

  or(other: IDisasterRecoverySpecification): IDisasterRecoverySpecification {
    return new DisasterRecoveryOrSpecification([...this._specs, other]);
  }

  not(): IDisasterRecoverySpecification {
    return new DisasterRecoveryNotSpecification(this);
  }

  getSpecifications(): IDisasterRecoverySpecification[] {
    return [...this._specs];
  }
}
