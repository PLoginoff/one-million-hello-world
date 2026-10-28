/**
 * NotificationAndSpecification
 */

import { INotificationSpecification } from './INotificationSpecification';
import { NotificationOrSpecification } from './NotificationOrSpecification';
import { NotificationNotSpecification } from './NotificationNotSpecification';

export class NotificationAndSpecification implements INotificationSpecification {
  private _specs: INotificationSpecification[];

  constructor(specs: INotificationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: INotificationSpecification): INotificationSpecification {
    return new NotificationAndSpecification([...this._specs, other]);
  }

  or(other: INotificationSpecification): INotificationSpecification {
    return new NotificationOrSpecification([this, other]);
  }

  not(): INotificationSpecification {
    return new NotificationNotSpecification(this);
  }

  getSpecifications(): INotificationSpecification[] {
    return [...this._specs];
  }
}
