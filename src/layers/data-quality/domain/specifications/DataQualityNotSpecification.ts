/**
 * DataQualityNotSpecification
 */

import { IDataQualitySpecification } from './IDataQualitySpecification';
import { DataQualityAndSpecification } from './DataQualityAndSpecification';
import { DataQualityOrSpecification } from './DataQualityOrSpecification';

export class DataQualityNotSpecification implements IDataQualitySpecification {
  private _spec: IDataQualitySpecification;

  constructor(spec: IDataQualitySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IDataQualitySpecification): IDataQualitySpecification {
    return new DataQualityAndSpecification([this, other]);
  }

  or(other: IDataQualitySpecification): IDataQualitySpecification {
    return new DataQualityOrSpecification([this, other]);
  }

  not(): IDataQualitySpecification {
    return this._spec;
  }

  getInner(): IDataQualitySpecification {
    return this._spec;
  }
}
