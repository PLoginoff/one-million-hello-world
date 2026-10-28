/**
 * ReportingAndSpecification
 */

import { IReportingSpecification } from './IReportingSpecification';
import { ReportingOrSpecification } from './ReportingOrSpecification';
import { ReportingNotSpecification } from './ReportingNotSpecification';

export class ReportingAndSpecification implements IReportingSpecification {
  private _specs: IReportingSpecification[];

  constructor(specs: IReportingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IReportingSpecification): IReportingSpecification {
    return new ReportingAndSpecification([...this._specs, other]);
  }

  or(other: IReportingSpecification): IReportingSpecification {
    return new ReportingOrSpecification([this, other]);
  }

  not(): IReportingSpecification {
    return new ReportingNotSpecification(this);
  }

  getSpecifications(): IReportingSpecification[] {
    return [...this._specs];
  }
}
