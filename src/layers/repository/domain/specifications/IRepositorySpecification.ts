/**
 * IRepositorySpecification interface
 */

export interface IRepositorySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IRepositorySpecification): IRepositorySpecification;
  or(other: IRepositorySpecification): IRepositorySpecification;
  not(): IRepositorySpecification;
}
