/**
 * EventSourcingOrSpecification
 */

import { IEventSourcingSpecification } from './IEventSourcingSpecification';
import { EventSourcingAndSpecification } from './EventSourcingAndSpecification';
import { EventSourcingNotSpecification } from './EventSourcingNotSpecification';

export class EventSourcingOrSpecification implements IEventSourcingSpecification {
  private _specs: IEventSourcingSpecification[];

  constructor(specs: IEventSourcingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IEventSourcingSpecification): IEventSourcingSpecification {
    return new EventSourcingAndSpecification([this, other]);
  }

  or(other: IEventSourcingSpecification): IEventSourcingSpecification {
    return new EventSourcingOrSpecification([...this._specs, other]);
  }

  not(): IEventSourcingSpecification {
    return new EventSourcingNotSpecification(this);
  }

  getSpecifications(): IEventSourcingSpecification[] {
    return [...this._specs];
  }
}
