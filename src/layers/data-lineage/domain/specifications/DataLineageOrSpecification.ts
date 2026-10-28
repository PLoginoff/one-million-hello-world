/**
 * DataLineageOrSpecification
 */

import { IDataLineageSpecification } from './IDataLineageSpecification';
import { DataLineageAndSpecification } from './DataLineageAndSpecification';
import { DataLineageNotSpecification } from './DataLineageNotSpecification';

export class DataLineageOrSpecification implements IDataLineageSpecification {
  private _specs: IDataLineageSpecification[];

  constructor(specs: IDataLineageSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDataLineageSpecification): IDataLineageSpecification {
    return new DataLineageAndSpecification([this, other]);
  }

  or(other: IDataLineageSpecification): IDataLineageSpecification {
    return new DataLineageOrSpecification([...this._specs, other]);
  }

  not(): IDataLineageSpecification {
    return new DataLineageNotSpecification(this);
  }

  getSpecifications(): IDataLineageSpecification[] {
    return [...this._specs];
  }
}
