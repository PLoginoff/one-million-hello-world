/**
 * IEdgeCacheSpecification interface
 */

export interface IEdgeCacheSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IEdgeCacheSpecification): IEdgeCacheSpecification;
  or(other: IEdgeCacheSpecification): IEdgeCacheSpecification;
  not(): IEdgeCacheSpecification;
}
