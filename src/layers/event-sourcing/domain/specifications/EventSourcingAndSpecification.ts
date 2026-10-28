/**
 * EventSourcingAndSpecification
 */

import { IEventSourcingSpecification } from './IEventSourcingSpecification';
import { EventSourcingOrSpecification } from './EventSourcingOrSpecification';
import { EventSourcingNotSpecification } from './EventSourcingNotSpecification';

export class EventSourcingAndSpecification implements IEventSourcingSpecification {
  private _specs: IEventSourcingSpecification[];

  constructor(specs: IEventSourcingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IEventSourcingSpecification): IEventSourcingSpecification {
    return new EventSourcingAndSpecification([...this._specs, other]);
  }

  or(other: IEventSourcingSpecification): IEventSourcingSpecification {
    return new EventSourcingOrSpecification([this, other]);
  }

  not(): IEventSourcingSpecification {
    return new EventSourcingNotSpecification(this);
  }

  getSpecifications(): IEventSourcingSpecification[] {
    return [...this._specs];
  }
}
