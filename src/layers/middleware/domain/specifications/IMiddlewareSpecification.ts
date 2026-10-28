/**
 * IMiddlewareSpecification interface
 */

export interface IMiddlewareSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IMiddlewareSpecification): IMiddlewareSpecification;
  or(other: IMiddlewareSpecification): IMiddlewareSpecification;
  not(): IMiddlewareSpecification;
}
