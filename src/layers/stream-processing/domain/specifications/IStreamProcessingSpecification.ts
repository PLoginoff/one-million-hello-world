/**
 * IStreamProcessingSpecification interface
 */

export interface IStreamProcessingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IStreamProcessingSpecification): IStreamProcessingSpecification;
  or(other: IStreamProcessingSpecification): IStreamProcessingSpecification;
  not(): IStreamProcessingSpecification;
}
