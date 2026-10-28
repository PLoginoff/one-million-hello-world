/**
 * DataLakeNotSpecification
 */

import { IDataLakeSpecification } from './IDataLakeSpecification';
import { DataLakeAndSpecification } from './DataLakeAndSpecification';
import { DataLakeOrSpecification } from './DataLakeOrSpecification';

export class DataLakeNotSpecification implements IDataLakeSpecification {
  private _spec: IDataLakeSpecification;

  constructor(spec: IDataLakeSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IDataLakeSpecification): IDataLakeSpecification {
    return new DataLakeAndSpecification([this, other]);
  }

  or(other: IDataLakeSpecification): IDataLakeSpecification {
    return new DataLakeOrSpecification([this, other]);
  }

  not(): IDataLakeSpecification {
    return this._spec;
  }

  getInner(): IDataLakeSpecification {
    return this._spec;
  }
}
