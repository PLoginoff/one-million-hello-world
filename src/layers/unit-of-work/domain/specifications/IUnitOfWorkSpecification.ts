/**
 * IUnitOfWorkSpecification interface
 */

export interface IUnitOfWorkSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IUnitOfWorkSpecification): IUnitOfWorkSpecification;
  or(other: IUnitOfWorkSpecification): IUnitOfWorkSpecification;
  not(): IUnitOfWorkSpecification;
}
