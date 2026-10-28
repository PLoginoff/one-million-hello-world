/**
 * AnomalyDetectionNotSpecification
 */

import { IAnomalyDetectionSpecification } from './IAnomalyDetectionSpecification';
import { AnomalyDetectionAndSpecification } from './AnomalyDetectionAndSpecification';
import { AnomalyDetectionOrSpecification } from './AnomalyDetectionOrSpecification';

export class AnomalyDetectionNotSpecification implements IAnomalyDetectionSpecification {
  private _spec: IAnomalyDetectionSpecification;

  constructor(spec: IAnomalyDetectionSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IAnomalyDetectionSpecification): IAnomalyDetectionSpecification {
    return new AnomalyDetectionAndSpecification([this, other]);
  }

  or(other: IAnomalyDetectionSpecification): IAnomalyDetectionSpecification {
    return new AnomalyDetectionOrSpecification([this, other]);
  }

  not(): IAnomalyDetectionSpecification {
    return this._spec;
  }

  getInner(): IAnomalyDetectionSpecification {
    return this._spec;
  }
}
