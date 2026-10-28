/**
 * IDataTransformationSpecification interface
 */

export interface IDataTransformationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IDataTransformationSpecification): IDataTransformationSpecification;
  or(other: IDataTransformationSpecification): IDataTransformationSpecification;
  not(): IDataTransformationSpecification;
}
