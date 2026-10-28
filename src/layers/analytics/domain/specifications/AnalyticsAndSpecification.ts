/**
 * AnalyticsAndSpecification
 */

import { IAnalyticsSpecification } from './IAnalyticsSpecification';
import { AnalyticsOrSpecification } from './AnalyticsOrSpecification';
import { AnalyticsNotSpecification } from './AnalyticsNotSpecification';

export class AnalyticsAndSpecification implements IAnalyticsSpecification {
  private _specs: IAnalyticsSpecification[];

  constructor(specs: IAnalyticsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IAnalyticsSpecification): IAnalyticsSpecification {
    return new AnalyticsAndSpecification([...this._specs, other]);
  }

  or(other: IAnalyticsSpecification): IAnalyticsSpecification {
    return new AnalyticsOrSpecification([this, other]);
  }

  not(): IAnalyticsSpecification {
    return new AnalyticsNotSpecification(this);
  }

  getSpecifications(): IAnalyticsSpecification[] {
    return [...this._specs];
  }
}
