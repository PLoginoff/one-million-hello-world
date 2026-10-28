/**
 * AnalyticsOrSpecification
 */

import { IAnalyticsSpecification } from './IAnalyticsSpecification';
import { AnalyticsAndSpecification } from './AnalyticsAndSpecification';
import { AnalyticsNotSpecification } from './AnalyticsNotSpecification';

export class AnalyticsOrSpecification implements IAnalyticsSpecification {
  private _specs: IAnalyticsSpecification[];

  constructor(specs: IAnalyticsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IAnalyticsSpecification): IAnalyticsSpecification {
    return new AnalyticsAndSpecification([this, other]);
  }

  or(other: IAnalyticsSpecification): IAnalyticsSpecification {
    return new AnalyticsOrSpecification([...this._specs, other]);
  }

  not(): IAnalyticsSpecification {
    return new AnalyticsNotSpecification(this);
  }

  getSpecifications(): IAnalyticsSpecification[] {
    return [...this._specs];
  }
}
