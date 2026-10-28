/**
 * DataQualityAndSpecification
 */

import { IDataQualitySpecification } from './IDataQualitySpecification';
import { DataQualityOrSpecification } from './DataQualityOrSpecification';
import { DataQualityNotSpecification } from './DataQualityNotSpecification';

export class DataQualityAndSpecification implements IDataQualitySpecification {
  private _specs: IDataQualitySpecification[];

  constructor(specs: IDataQualitySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDataQualitySpecification): IDataQualitySpecification {
    return new DataQualityAndSpecification([...this._specs, other]);
  }

  or(other: IDataQualitySpecification): IDataQualitySpecification {
    return new DataQualityOrSpecification([this, other]);
  }

  not(): IDataQualitySpecification {
    return new DataQualityNotSpecification(this);
  }

  getSpecifications(): IDataQualitySpecification[] {
    return [...this._specs];
  }
}
