/**
 * EventNotSpecification
 */

import { IEventSpecification } from './IEventSpecification';
import { EventAndSpecification } from './EventAndSpecification';
import { EventOrSpecification } from './EventOrSpecification';

export class EventNotSpecification implements IEventSpecification {
  private _spec: IEventSpecification;

  constructor(spec: IEventSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IEventSpecification): IEventSpecification {
    return new EventAndSpecification([this, other]);
  }

  or(other: IEventSpecification): IEventSpecification {
    return new EventOrSpecification([this, other]);
  }

  not(): IEventSpecification {
    return this._spec;
  }

  getInner(): IEventSpecification {
    return this._spec;
  }
}
