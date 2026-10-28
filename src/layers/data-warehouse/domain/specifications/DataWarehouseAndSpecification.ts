/**
 * DataWarehouseAndSpecification
 */

import { IDataWarehouseSpecification } from './IDataWarehouseSpecification';
import { DataWarehouseOrSpecification } from './DataWarehouseOrSpecification';
import { DataWarehouseNotSpecification } from './DataWarehouseNotSpecification';

export class DataWarehouseAndSpecification implements IDataWarehouseSpecification {
  private _specs: IDataWarehouseSpecification[];

  constructor(specs: IDataWarehouseSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDataWarehouseSpecification): IDataWarehouseSpecification {
    return new DataWarehouseAndSpecification([...this._specs, other]);
  }

  or(other: IDataWarehouseSpecification): IDataWarehouseSpecification {
    return new DataWarehouseOrSpecification([this, other]);
  }

  not(): IDataWarehouseSpecification {
    return new DataWarehouseNotSpecification(this);
  }

  getSpecifications(): IDataWarehouseSpecification[] {
    return [...this._specs];
  }
}
