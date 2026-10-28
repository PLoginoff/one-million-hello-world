/**
 * IDataQualitySpecification interface
 */

export interface IDataQualitySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IDataQualitySpecification): IDataQualitySpecification;
  or(other: IDataQualitySpecification): IDataQualitySpecification;
  not(): IDataQualitySpecification;
}
