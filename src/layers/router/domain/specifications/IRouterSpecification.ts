/**
 * IRouterSpecification interface
 */

export interface IRouterSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IRouterSpecification): IRouterSpecification;
  or(other: IRouterSpecification): IRouterSpecification;
  not(): IRouterSpecification;
}
