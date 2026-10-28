/**
 * EventOrSpecification
 */

import { IEventSpecification } from './IEventSpecification';
import { EventAndSpecification } from './EventAndSpecification';
import { EventNotSpecification } from './EventNotSpecification';

export class EventOrSpecification implements IEventSpecification {
  private _specs: IEventSpecification[];

  constructor(specs: IEventSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IEventSpecification): IEventSpecification {
    return new EventAndSpecification([this, other]);
  }

  or(other: IEventSpecification): IEventSpecification {
    return new EventOrSpecification([...this._specs, other]);
  }

  not(): IEventSpecification {
    return new EventNotSpecification(this);
  }

  getSpecifications(): IEventSpecification[] {
    return [...this._specs];
  }
}
