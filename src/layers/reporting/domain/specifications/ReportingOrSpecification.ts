/**
 * ReportingOrSpecification
 */

import { IReportingSpecification } from './IReportingSpecification';
import { ReportingAndSpecification } from './ReportingAndSpecification';
import { ReportingNotSpecification } from './ReportingNotSpecification';

export class ReportingOrSpecification implements IReportingSpecification {
  private _specs: IReportingSpecification[];

  constructor(specs: IReportingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IReportingSpecification): IReportingSpecification {
    return new ReportingAndSpecification([this, other]);
  }

  or(other: IReportingSpecification): IReportingSpecification {
    return new ReportingOrSpecification([...this._specs, other]);
  }

  not(): IReportingSpecification {
    return new ReportingNotSpecification(this);
  }

  getSpecifications(): IReportingSpecification[] {
    return [...this._specs];
  }
}
