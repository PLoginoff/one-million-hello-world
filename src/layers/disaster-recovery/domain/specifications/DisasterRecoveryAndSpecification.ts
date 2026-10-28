/**
 * DisasterRecoveryAndSpecification
 */

import { IDisasterRecoverySpecification } from './IDisasterRecoverySpecification';
import { DisasterRecoveryOrSpecification } from './DisasterRecoveryOrSpecification';
import { DisasterRecoveryNotSpecification } from './DisasterRecoveryNotSpecification';

export class DisasterRecoveryAndSpecification implements IDisasterRecoverySpecification {
  private _specs: IDisasterRecoverySpecification[];

  constructor(specs: IDisasterRecoverySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDisasterRecoverySpecification): IDisasterRecoverySpecification {
    return new DisasterRecoveryAndSpecification([...this._specs, other]);
  }

  or(other: IDisasterRecoverySpecification): IDisasterRecoverySpecification {
    return new DisasterRecoveryOrSpecification([this, other]);
  }

  not(): IDisasterRecoverySpecification {
    return new DisasterRecoveryNotSpecification(this);
  }

  getSpecifications(): IDisasterRecoverySpecification[] {
    return [...this._specs];
  }
}
