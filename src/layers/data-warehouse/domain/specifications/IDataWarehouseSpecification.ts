/**
 * IDataWarehouseSpecification interface
 */

export interface IDataWarehouseSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IDataWarehouseSpecification): IDataWarehouseSpecification;
  or(other: IDataWarehouseSpecification): IDataWarehouseSpecification;
  not(): IDataWarehouseSpecification;
}
