/**
 * MessageQueueNotSpecification
 */

import { IMessageQueueSpecification } from './IMessageQueueSpecification';
import { MessageQueueAndSpecification } from './MessageQueueAndSpecification';
import { MessageQueueOrSpecification } from './MessageQueueOrSpecification';

export class MessageQueueNotSpecification implements IMessageQueueSpecification {
  private _spec: IMessageQueueSpecification;

  constructor(spec: IMessageQueueSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IMessageQueueSpecification): IMessageQueueSpecification {
    return new MessageQueueAndSpecification([this, other]);
  }

  or(other: IMessageQueueSpecification): IMessageQueueSpecification {
    return new MessageQueueOrSpecification([this, other]);
  }

  not(): IMessageQueueSpecification {
    return this._spec;
  }

  getInner(): IMessageQueueSpecification {
    return this._spec;
  }
}
