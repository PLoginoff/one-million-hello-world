/**
 * IQueryObjectSpecification interface
 */

export interface IQueryObjectSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IQueryObjectSpecification): IQueryObjectSpecification;
  or(other: IQueryObjectSpecification): IQueryObjectSpecification;
  not(): IQueryObjectSpecification;
}
