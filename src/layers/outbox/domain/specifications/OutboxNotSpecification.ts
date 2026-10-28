/**
 * OutboxNotSpecification
 */

import { IOutboxSpecification } from './IOutboxSpecification';
import { OutboxAndSpecification } from './OutboxAndSpecification';
import { OutboxOrSpecification } from './OutboxOrSpecification';

export class OutboxNotSpecification implements IOutboxSpecification {
  private _spec: IOutboxSpecification;

  constructor(spec: IOutboxSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IOutboxSpecification): IOutboxSpecification {
    return new OutboxAndSpecification([this, other]);
  }

  or(other: IOutboxSpecification): IOutboxSpecification {
    return new OutboxOrSpecification([this, other]);
  }

  not(): IOutboxSpecification {
    return this._spec;
  }

  getInner(): IOutboxSpecification {
    return this._spec;
  }
}
