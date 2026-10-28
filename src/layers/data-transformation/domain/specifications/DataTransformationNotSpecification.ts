/**
 * DataTransformationNotSpecification
 */

import { IDataTransformationSpecification } from './IDataTransformationSpecification';
import { DataTransformationAndSpecification } from './DataTransformationAndSpecification';
import { DataTransformationOrSpecification } from './DataTransformationOrSpecification';

export class DataTransformationNotSpecification implements IDataTransformationSpecification {
  private _spec: IDataTransformationSpecification;

  constructor(spec: IDataTransformationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IDataTransformationSpecification): IDataTransformationSpecification {
    return new DataTransformationAndSpecification([this, other]);
  }

  or(other: IDataTransformationSpecification): IDataTransformationSpecification {
    return new DataTransformationOrSpecification([this, other]);
  }

  not(): IDataTransformationSpecification {
    return this._spec;
  }

  getInner(): IDataTransformationSpecification {
    return this._spec;
  }
}
