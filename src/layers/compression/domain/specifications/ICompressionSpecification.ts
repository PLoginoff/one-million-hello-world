/**
 * ICompressionSpecification interface
 */

export interface ICompressionSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ICompressionSpecification): ICompressionSpecification;
  or(other: ICompressionSpecification): ICompressionSpecification;
  not(): ICompressionSpecification;
}
