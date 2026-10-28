/**
 * DataLakeOrSpecification
 */

import { IDataLakeSpecification } from './IDataLakeSpecification';
import { DataLakeAndSpecification } from './DataLakeAndSpecification';
import { DataLakeNotSpecification } from './DataLakeNotSpecification';

export class DataLakeOrSpecification implements IDataLakeSpecification {
  private _specs: IDataLakeSpecification[];

  constructor(specs: IDataLakeSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDataLakeSpecification): IDataLakeSpecification {
    return new DataLakeAndSpecification([this, other]);
  }

  or(other: IDataLakeSpecification): IDataLakeSpecification {
    return new DataLakeOrSpecification([...this._specs, other]);
  }

  not(): IDataLakeSpecification {
    return new DataLakeNotSpecification(this);
  }

  getSpecifications(): IDataLakeSpecification[] {
    return [...this._specs];
  }
}
