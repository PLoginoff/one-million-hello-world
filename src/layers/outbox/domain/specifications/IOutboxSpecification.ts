/**
 * IOutboxSpecification interface
 */

export interface IOutboxSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IOutboxSpecification): IOutboxSpecification;
  or(other: IOutboxSpecification): IOutboxSpecification;
  not(): IOutboxSpecification;
}
