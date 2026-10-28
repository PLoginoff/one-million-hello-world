/**
 * EventAndSpecification
 */

import { IEventSpecification } from './IEventSpecification';
import { EventOrSpecification } from './EventOrSpecification';
import { EventNotSpecification } from './EventNotSpecification';

export class EventAndSpecification implements IEventSpecification {
  private _specs: IEventSpecification[];

  constructor(specs: IEventSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IEventSpecification): IEventSpecification {
    return new EventAndSpecification([...this._specs, other]);
  }

  or(other: IEventSpecification): IEventSpecification {
    return new EventOrSpecification([this, other]);
  }

  not(): IEventSpecification {
    return new EventNotSpecification(this);
  }

  getSpecifications(): IEventSpecification[] {
    return [...this._specs];
  }
}
