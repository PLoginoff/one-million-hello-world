/**
 * AnomalyDetectionAndSpecification
 */

import { IAnomalyDetectionSpecification } from './IAnomalyDetectionSpecification';
import { AnomalyDetectionOrSpecification } from './AnomalyDetectionOrSpecification';
import { AnomalyDetectionNotSpecification } from './AnomalyDetectionNotSpecification';

export class AnomalyDetectionAndSpecification implements IAnomalyDetectionSpecification {
  private _specs: IAnomalyDetectionSpecification[];

  constructor(specs: IAnomalyDetectionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IAnomalyDetectionSpecification): IAnomalyDetectionSpecification {
    return new AnomalyDetectionAndSpecification([...this._specs, other]);
  }

  or(other: IAnomalyDetectionSpecification): IAnomalyDetectionSpecification {
    return new AnomalyDetectionOrSpecification([this, other]);
  }

  not(): IAnomalyDetectionSpecification {
    return new AnomalyDetectionNotSpecification(this);
  }

  getSpecifications(): IAnomalyDetectionSpecification[] {
    return [...this._specs];
  }
}
