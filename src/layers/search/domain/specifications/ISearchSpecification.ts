/**
 * ISearchSpecification interface
 */

export interface ISearchSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISearchSpecification): ISearchSpecification;
  or(other: ISearchSpecification): ISearchSpecification;
  not(): ISearchSpecification;
}
