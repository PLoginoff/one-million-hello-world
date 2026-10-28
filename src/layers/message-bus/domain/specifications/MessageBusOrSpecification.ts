/**
 * MessageBusOrSpecification
 */

import { IMessageBusSpecification } from './IMessageBusSpecification';
import { MessageBusAndSpecification } from './MessageBusAndSpecification';
import { MessageBusNotSpecification } from './MessageBusNotSpecification';

export class MessageBusOrSpecification implements IMessageBusSpecification {
  private _specs: IMessageBusSpecification[];

  constructor(specs: IMessageBusSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMessageBusSpecification): IMessageBusSpecification {
    return new MessageBusAndSpecification([this, other]);
  }

  or(other: IMessageBusSpecification): IMessageBusSpecification {
    return new MessageBusOrSpecification([...this._specs, other]);
  }

  not(): IMessageBusSpecification {
    return new MessageBusNotSpecification(this);
  }

  getSpecifications(): IMessageBusSpecification[] {
    return [...this._specs];
  }
}
