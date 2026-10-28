/**
 * DataLineageNotSpecification
 */

import { IDataLineageSpecification } from './IDataLineageSpecification';
import { DataLineageAndSpecification } from './DataLineageAndSpecification';
import { DataLineageOrSpecification } from './DataLineageOrSpecification';

export class DataLineageNotSpecification implements IDataLineageSpecification {
  private _spec: IDataLineageSpecification;

  constructor(spec: IDataLineageSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IDataLineageSpecification): IDataLineageSpecification {
    return new DataLineageAndSpecification([this, other]);
  }

  or(other: IDataLineageSpecification): IDataLineageSpecification {
    return new DataLineageOrSpecification([this, other]);
  }

  not(): IDataLineageSpecification {
    return this._spec;
  }

  getInner(): IDataLineageSpecification {
    return this._spec;
  }
}
