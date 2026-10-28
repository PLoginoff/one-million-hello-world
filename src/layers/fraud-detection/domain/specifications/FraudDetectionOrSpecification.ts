/**
 * FraudDetectionOrSpecification
 */

import { IFraudDetectionSpecification } from './IFraudDetectionSpecification';
import { FraudDetectionAndSpecification } from './FraudDetectionAndSpecification';
import { FraudDetectionNotSpecification } from './FraudDetectionNotSpecification';

export class FraudDetectionOrSpecification implements IFraudDetectionSpecification {
  private _specs: IFraudDetectionSpecification[];

  constructor(specs: IFraudDetectionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IFraudDetectionSpecification): IFraudDetectionSpecification {
    return new FraudDetectionAndSpecification([this, other]);
  }

  or(other: IFraudDetectionSpecification): IFraudDetectionSpecification {
    return new FraudDetectionOrSpecification([...this._specs, other]);
  }

  not(): IFraudDetectionSpecification {
    return new FraudDetectionNotSpecification(this);
  }

  getSpecifications(): IFraudDetectionSpecification[] {
    return [...this._specs];
  }
}
