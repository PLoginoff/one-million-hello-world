/**
 * ReportingNotSpecification
 */

import { IReportingSpecification } from './IReportingSpecification';
import { ReportingAndSpecification } from './ReportingAndSpecification';
import { ReportingOrSpecification } from './ReportingOrSpecification';

export class ReportingNotSpecification implements IReportingSpecification {
  private _spec: IReportingSpecification;

  constructor(spec: IReportingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IReportingSpecification): IReportingSpecification {
    return new ReportingAndSpecification([this, other]);
  }

  or(other: IReportingSpecification): IReportingSpecification {
    return new ReportingOrSpecification([this, other]);
  }

  not(): IReportingSpecification {
    return this._spec;
  }

  getInner(): IReportingSpecification {
    return this._spec;
  }
}
