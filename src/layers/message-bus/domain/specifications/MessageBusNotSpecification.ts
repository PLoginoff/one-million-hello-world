/**
 * MessageBusNotSpecification
 */

import { IMessageBusSpecification } from './IMessageBusSpecification';
import { MessageBusAndSpecification } from './MessageBusAndSpecification';
import { MessageBusOrSpecification } from './MessageBusOrSpecification';

export class MessageBusNotSpecification implements IMessageBusSpecification {
  private _spec: IMessageBusSpecification;

  constructor(spec: IMessageBusSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IMessageBusSpecification): IMessageBusSpecification {
    return new MessageBusAndSpecification([this, other]);
  }

  or(other: IMessageBusSpecification): IMessageBusSpecification {
    return new MessageBusOrSpecification([this, other]);
  }

  not(): IMessageBusSpecification {
    return this._spec;
  }

  getInner(): IMessageBusSpecification {
    return this._spec;
  }
}
