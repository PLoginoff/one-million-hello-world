/**
 * IEventSpecification interface
 */

export interface IEventSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IEventSpecification): IEventSpecification;
  or(other: IEventSpecification): IEventSpecification;
  not(): IEventSpecification;
}
