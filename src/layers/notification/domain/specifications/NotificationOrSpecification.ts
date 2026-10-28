/**
 * NotificationOrSpecification
 */

import { INotificationSpecification } from './INotificationSpecification';
import { NotificationAndSpecification } from './NotificationAndSpecification';
import { NotificationNotSpecification } from './NotificationNotSpecification';

export class NotificationOrSpecification implements INotificationSpecification {
  private _specs: INotificationSpecification[];

  constructor(specs: INotificationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: INotificationSpecification): INotificationSpecification {
    return new NotificationAndSpecification([this, other]);
  }

  or(other: INotificationSpecification): INotificationSpecification {
    return new NotificationOrSpecification([...this._specs, other]);
  }

  not(): INotificationSpecification {
    return new NotificationNotSpecification(this);
  }

  getSpecifications(): INotificationSpecification[] {
    return [...this._specs];
  }
}
