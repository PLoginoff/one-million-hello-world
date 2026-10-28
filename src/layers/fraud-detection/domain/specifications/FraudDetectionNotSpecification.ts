/**
 * FraudDetectionNotSpecification
 */

import { IFraudDetectionSpecification } from './IFraudDetectionSpecification';
import { FraudDetectionAndSpecification } from './FraudDetectionAndSpecification';
import { FraudDetectionOrSpecification } from './FraudDetectionOrSpecification';

export class FraudDetectionNotSpecification implements IFraudDetectionSpecification {
  private _spec: IFraudDetectionSpecification;

  constructor(spec: IFraudDetectionSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IFraudDetectionSpecification): IFraudDetectionSpecification {
    return new FraudDetectionAndSpecification([this, other]);
  }

  or(other: IFraudDetectionSpecification): IFraudDetectionSpecification {
    return new FraudDetectionOrSpecification([this, other]);
  }

  not(): IFraudDetectionSpecification {
    return this._spec;
  }

  getInner(): IFraudDetectionSpecification {
    return this._spec;
  }
}
