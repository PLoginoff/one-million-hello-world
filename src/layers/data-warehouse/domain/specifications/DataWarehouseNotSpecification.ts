/**
 * DataWarehouseNotSpecification
 */

import { IDataWarehouseSpecification } from './IDataWarehouseSpecification';
import { DataWarehouseAndSpecification } from './DataWarehouseAndSpecification';
import { DataWarehouseOrSpecification } from './DataWarehouseOrSpecification';

export class DataWarehouseNotSpecification implements IDataWarehouseSpecification {
  private _spec: IDataWarehouseSpecification;

  constructor(spec: IDataWarehouseSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IDataWarehouseSpecification): IDataWarehouseSpecification {
    return new DataWarehouseAndSpecification([this, other]);
  }

  or(other: IDataWarehouseSpecification): IDataWarehouseSpecification {
    return new DataWarehouseOrSpecification([this, other]);
  }

  not(): IDataWarehouseSpecification {
    return this._spec;
  }

  getInner(): IDataWarehouseSpecification {
    return this._spec;
  }
}
