/**
 * IMessageQueueSpecification interface
 */

export interface IMessageQueueSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IMessageQueueSpecification): IMessageQueueSpecification;
  or(other: IMessageQueueSpecification): IMessageQueueSpecification;
  not(): IMessageQueueSpecification;
}
