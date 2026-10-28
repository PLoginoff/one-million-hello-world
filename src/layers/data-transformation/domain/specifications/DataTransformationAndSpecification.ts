/**
 * DataTransformationAndSpecification
 */

import { IDataTransformationSpecification } from './IDataTransformationSpecification';
import { DataTransformationOrSpecification } from './DataTransformationOrSpecification';
import { DataTransformationNotSpecification } from './DataTransformationNotSpecification';

export class DataTransformationAndSpecification implements IDataTransformationSpecification {
  private _specs: IDataTransformationSpecification[];

  constructor(specs: IDataTransformationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDataTransformationSpecification): IDataTransformationSpecification {
    return new DataTransformationAndSpecification([...this._specs, other]);
  }

  or(other: IDataTransformationSpecification): IDataTransformationSpecification {
    return new DataTransformationOrSpecification([this, other]);
  }

  not(): IDataTransformationSpecification {
    return new DataTransformationNotSpecification(this);
  }

  getSpecifications(): IDataTransformationSpecification[] {
    return [...this._specs];
  }
}
