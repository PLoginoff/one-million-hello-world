/**
 * FraudDetectionAndSpecification
 */

import { IFraudDetectionSpecification } from './IFraudDetectionSpecification';
import { FraudDetectionOrSpecification } from './FraudDetectionOrSpecification';
import { FraudDetectionNotSpecification } from './FraudDetectionNotSpecification';

export class FraudDetectionAndSpecification implements IFraudDetectionSpecification {
  private _specs: IFraudDetectionSpecification[];

  constructor(specs: IFraudDetectionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IFraudDetectionSpecification): IFraudDetectionSpecification {
    return new FraudDetectionAndSpecification([...this._specs, other]);
  }

  or(other: IFraudDetectionSpecification): IFraudDetectionSpecification {
    return new FraudDetectionOrSpecification([this, other]);
  }

  not(): IFraudDetectionSpecification {
    return new FraudDetectionNotSpecification(this);
  }

  getSpecifications(): IFraudDetectionSpecification[] {
    return [...this._specs];
  }
}
