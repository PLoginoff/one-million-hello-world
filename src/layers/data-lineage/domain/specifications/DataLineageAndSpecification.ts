/**
 * DataLineageAndSpecification
 */

import { IDataLineageSpecification } from './IDataLineageSpecification';
import { DataLineageOrSpecification } from './DataLineageOrSpecification';
import { DataLineageNotSpecification } from './DataLineageNotSpecification';

export class DataLineageAndSpecification implements IDataLineageSpecification {
  private _specs: IDataLineageSpecification[];

  constructor(specs: IDataLineageSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDataLineageSpecification): IDataLineageSpecification {
    return new DataLineageAndSpecification([...this._specs, other]);
  }

  or(other: IDataLineageSpecification): IDataLineageSpecification {
    return new DataLineageOrSpecification([this, other]);
  }

  not(): IDataLineageSpecification {
    return new DataLineageNotSpecification(this);
  }

  getSpecifications(): IDataLineageSpecification[] {
    return [...this._specs];
  }
}
