/**
 * AnalyticsNotSpecification
 */

import { IAnalyticsSpecification } from './IAnalyticsSpecification';
import { AnalyticsAndSpecification } from './AnalyticsAndSpecification';
import { AnalyticsOrSpecification } from './AnalyticsOrSpecification';

export class AnalyticsNotSpecification implements IAnalyticsSpecification {
  private _spec: IAnalyticsSpecification;

  constructor(spec: IAnalyticsSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IAnalyticsSpecification): IAnalyticsSpecification {
    return new AnalyticsAndSpecification([this, other]);
  }

  or(other: IAnalyticsSpecification): IAnalyticsSpecification {
    return new AnalyticsOrSpecification([this, other]);
  }

  not(): IAnalyticsSpecification {
    return this._spec;
  }

  getInner(): IAnalyticsSpecification {
    return this._spec;
  }
}
