/**
 * DataWarehouseOrSpecification
 */

import { IDataWarehouseSpecification } from './IDataWarehouseSpecification';
import { DataWarehouseAndSpecification } from './DataWarehouseAndSpecification';
import { DataWarehouseNotSpecification } from './DataWarehouseNotSpecification';

export class DataWarehouseOrSpecification implements IDataWarehouseSpecification {
  private _specs: IDataWarehouseSpecification[];

  constructor(specs: IDataWarehouseSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDataWarehouseSpecification): IDataWarehouseSpecification {
    return new DataWarehouseAndSpecification([this, other]);
  }

  or(other: IDataWarehouseSpecification): IDataWarehouseSpecification {
    return new DataWarehouseOrSpecification([...this._specs, other]);
  }

  not(): IDataWarehouseSpecification {
    return new DataWarehouseNotSpecification(this);
  }

  getSpecifications(): IDataWarehouseSpecification[] {
    return [...this._specs];
  }
}
