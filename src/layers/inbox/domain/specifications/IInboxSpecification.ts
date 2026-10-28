/**
 * IInboxSpecification interface
 */

export interface IInboxSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IInboxSpecification): IInboxSpecification;
  or(other: IInboxSpecification): IInboxSpecification;
  not(): IInboxSpecification;
}
