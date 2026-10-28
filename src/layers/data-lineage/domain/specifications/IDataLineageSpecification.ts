/**
 * IDataLineageSpecification interface
 */

export interface IDataLineageSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IDataLineageSpecification): IDataLineageSpecification;
  or(other: IDataLineageSpecification): IDataLineageSpecification;
  not(): IDataLineageSpecification;
}
