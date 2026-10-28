/**
 * DataLakeAndSpecification
 */

import { IDataLakeSpecification } from './IDataLakeSpecification';
import { DataLakeOrSpecification } from './DataLakeOrSpecification';
import { DataLakeNotSpecification } from './DataLakeNotSpecification';

export class DataLakeAndSpecification implements IDataLakeSpecification {
  private _specs: IDataLakeSpecification[];

  constructor(specs: IDataLakeSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDataLakeSpecification): IDataLakeSpecification {
    return new DataLakeAndSpecification([...this._specs, other]);
  }

  or(other: IDataLakeSpecification): IDataLakeSpecification {
    return new DataLakeOrSpecification([this, other]);
  }

  not(): IDataLakeSpecification {
    return new DataLakeNotSpecification(this);
  }

  getSpecifications(): IDataLakeSpecification[] {
    return [...this._specs];
  }
}
