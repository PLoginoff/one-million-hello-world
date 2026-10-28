/**
 * EventSourcingNotSpecification
 */

import { IEventSourcingSpecification } from './IEventSourcingSpecification';
import { EventSourcingAndSpecification } from './EventSourcingAndSpecification';
import { EventSourcingOrSpecification } from './EventSourcingOrSpecification';

export class EventSourcingNotSpecification implements IEventSourcingSpecification {
  private _spec: IEventSourcingSpecification;

  constructor(spec: IEventSourcingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IEventSourcingSpecification): IEventSourcingSpecification {
    return new EventSourcingAndSpecification([this, other]);
  }

  or(other: IEventSourcingSpecification): IEventSourcingSpecification {
    return new EventSourcingOrSpecification([this, other]);
  }

  not(): IEventSourcingSpecification {
    return this._spec;
  }

  getInner(): IEventSourcingSpecification {
    return this._spec;
  }
}
