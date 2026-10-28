/**
 * NotificationNotSpecification
 */

import { INotificationSpecification } from './INotificationSpecification';
import { NotificationAndSpecification } from './NotificationAndSpecification';
import { NotificationOrSpecification } from './NotificationOrSpecification';

export class NotificationNotSpecification implements INotificationSpecification {
  private _spec: INotificationSpecification;

  constructor(spec: INotificationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: INotificationSpecification): INotificationSpecification {
    return new NotificationAndSpecification([this, other]);
  }

  or(other: INotificationSpecification): INotificationSpecification {
    return new NotificationOrSpecification([this, other]);
  }

  not(): INotificationSpecification {
    return this._spec;
  }

  getInner(): INotificationSpecification {
    return this._spec;
  }
}
