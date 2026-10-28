/**
 * DataQualityOrSpecification
 */

import { IDataQualitySpecification } from './IDataQualitySpecification';
import { DataQualityAndSpecification } from './DataQualityAndSpecification';
import { DataQualityNotSpecification } from './DataQualityNotSpecification';

export class DataQualityOrSpecification implements IDataQualitySpecification {
  private _specs: IDataQualitySpecification[];

  constructor(specs: IDataQualitySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDataQualitySpecification): IDataQualitySpecification {
    return new DataQualityAndSpecification([this, other]);
  }

  or(other: IDataQualitySpecification): IDataQualitySpecification {
    return new DataQualityOrSpecification([...this._specs, other]);
  }

  not(): IDataQualitySpecification {
    return new DataQualityNotSpecification(this);
  }

  getSpecifications(): IDataQualitySpecification[] {
    return [...this._specs];
  }
}
