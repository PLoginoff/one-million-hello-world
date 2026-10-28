/**
 * MessageQueueAndSpecification
 */

import { IMessageQueueSpecification } from './IMessageQueueSpecification';
import { MessageQueueOrSpecification } from './MessageQueueOrSpecification';
import { MessageQueueNotSpecification } from './MessageQueueNotSpecification';

export class MessageQueueAndSpecification implements IMessageQueueSpecification {
  private _specs: IMessageQueueSpecification[];

  constructor(specs: IMessageQueueSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMessageQueueSpecification): IMessageQueueSpecification {
    return new MessageQueueAndSpecification([...this._specs, other]);
  }

  or(other: IMessageQueueSpecification): IMessageQueueSpecification {
    return new MessageQueueOrSpecification([this, other]);
  }

  not(): IMessageQueueSpecification {
    return new MessageQueueNotSpecification(this);
  }

  getSpecifications(): IMessageQueueSpecification[] {
    return [...this._specs];
  }
}
