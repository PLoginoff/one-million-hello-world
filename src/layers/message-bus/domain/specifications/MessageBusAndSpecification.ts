/**
 * MessageBusAndSpecification
 */

import { IMessageBusSpecification } from './IMessageBusSpecification';
import { MessageBusOrSpecification } from './MessageBusOrSpecification';
import { MessageBusNotSpecification } from './MessageBusNotSpecification';

export class MessageBusAndSpecification implements IMessageBusSpecification {
  private _specs: IMessageBusSpecification[];

  constructor(specs: IMessageBusSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMessageBusSpecification): IMessageBusSpecification {
    return new MessageBusAndSpecification([...this._specs, other]);
  }

  or(other: IMessageBusSpecification): IMessageBusSpecification {
    return new MessageBusOrSpecification([this, other]);
  }

  not(): IMessageBusSpecification {
    return new MessageBusNotSpecification(this);
  }

  getSpecifications(): IMessageBusSpecification[] {
    return [...this._specs];
  }
}
