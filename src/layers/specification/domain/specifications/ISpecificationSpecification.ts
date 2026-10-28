/**
 * ISpecificationSpecification interface
 */

export interface ISpecificationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISpecificationSpecification): ISpecificationSpecification;
  or(other: ISpecificationSpecification): ISpecificationSpecification;
  not(): ISpecificationSpecification;
}
