/**
 * AnomalyDetectionOrSpecification
 */

import { IAnomalyDetectionSpecification } from './IAnomalyDetectionSpecification';
import { AnomalyDetectionAndSpecification } from './AnomalyDetectionAndSpecification';
import { AnomalyDetectionNotSpecification } from './AnomalyDetectionNotSpecification';

export class AnomalyDetectionOrSpecification implements IAnomalyDetectionSpecification {
  private _specs: IAnomalyDetectionSpecification[];

  constructor(specs: IAnomalyDetectionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IAnomalyDetectionSpecification): IAnomalyDetectionSpecification {
    return new AnomalyDetectionAndSpecification([this, other]);
  }

  or(other: IAnomalyDetectionSpecification): IAnomalyDetectionSpecification {
    return new AnomalyDetectionOrSpecification([...this._specs, other]);
  }

  not(): IAnomalyDetectionSpecification {
    return new AnomalyDetectionNotSpecification(this);
  }

  getSpecifications(): IAnomalyDetectionSpecification[] {
    return [...this._specs];
  }
}
