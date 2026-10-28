/**
 * MessageQueueOrSpecification
 */

import { IMessageQueueSpecification } from './IMessageQueueSpecification';
import { MessageQueueAndSpecification } from './MessageQueueAndSpecification';
import { MessageQueueNotSpecification } from './MessageQueueNotSpecification';

export class MessageQueueOrSpecification implements IMessageQueueSpecification {
  private _specs: IMessageQueueSpecification[];

  constructor(specs: IMessageQueueSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IMessageQueueSpecification): IMessageQueueSpecification {
    return new MessageQueueAndSpecification([this, other]);
  }

  or(other: IMessageQueueSpecification): IMessageQueueSpecification {
    return new MessageQueueOrSpecification([...this._specs, other]);
  }

  not(): IMessageQueueSpecification {
    return new MessageQueueNotSpecification(this);
  }

  getSpecifications(): IMessageQueueSpecification[] {
    return [...this._specs];
  }
}
