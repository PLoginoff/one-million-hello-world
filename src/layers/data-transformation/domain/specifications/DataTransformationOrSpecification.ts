/**
 * DataTransformationOrSpecification
 */

import { IDataTransformationSpecification } from './IDataTransformationSpecification';
import { DataTransformationAndSpecification } from './DataTransformationAndSpecification';
import { DataTransformationNotSpecification } from './DataTransformationNotSpecification';

export class DataTransformationOrSpecification implements IDataTransformationSpecification {
  private _specs: IDataTransformationSpecification[];

  constructor(specs: IDataTransformationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDataTransformationSpecification): IDataTransformationSpecification {
    return new DataTransformationAndSpecification([this, other]);
  }

  or(other: IDataTransformationSpecification): IDataTransformationSpecification {
    return new DataTransformationOrSpecification([...this._specs, other]);
  }

  not(): IDataTransformationSpecification {
    return new DataTransformationNotSpecification(this);
  }

  getSpecifications(): IDataTransformationSpecification[] {
    return [...this._specs];
  }
}
