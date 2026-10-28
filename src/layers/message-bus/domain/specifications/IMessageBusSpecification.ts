/**
 * IMessageBusSpecification interface
 */

export interface IMessageBusSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IMessageBusSpecification): IMessageBusSpecification;
  or(other: IMessageBusSpecification): IMessageBusSpecification;
  not(): IMessageBusSpecification;
}
