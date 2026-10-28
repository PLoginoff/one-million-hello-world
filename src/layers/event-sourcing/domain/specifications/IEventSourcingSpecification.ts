/**
 * IEventSourcingSpecification interface
 */

export interface IEventSourcingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IEventSourcingSpecification): IEventSourcingSpecification;
  or(other: IEventSourcingSpecification): IEventSourcingSpecification;
  not(): IEventSourcingSpecification;
}
