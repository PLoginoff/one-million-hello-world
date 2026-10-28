/**
 * IGraphqlSpecification interface
 */

export interface IGraphqlSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IGraphqlSpecification): IGraphqlSpecification;
  or(other: IGraphqlSpecification): IGraphqlSpecification;
  not(): IGraphqlSpecification;
}
