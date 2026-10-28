/**
 * IDataLakeSpecification interface
 */

export interface IDataLakeSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IDataLakeSpecification): IDataLakeSpecification;
  or(other: IDataLakeSpecification): IDataLakeSpecification;
  not(): IDataLakeSpecification;
}
