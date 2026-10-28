/**
 * INotificationSpecification interface
 */

export interface INotificationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: INotificationSpecification): INotificationSpecification;
  or(other: INotificationSpecification): INotificationSpecification;
  not(): INotificationSpecification;
}
