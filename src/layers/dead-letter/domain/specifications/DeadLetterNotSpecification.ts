/**
 * DeadLetterNotSpecification
 */

import { IDeadLetterSpecification } from './IDeadLetterSpecification';
import { DeadLetterAndSpecification } from './DeadLetterAndSpecification';
import { DeadLetterOrSpecification } from './DeadLetterOrSpecification';

export class DeadLetterNotSpecification implements IDeadLetterSpecification {
  private _spec: IDeadLetterSpecification;

  constructor(spec: IDeadLetterSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IDeadLetterSpecification): IDeadLetterSpecification {
    return new DeadLetterAndSpecification([this, other]);
  }

  or(other: IDeadLetterSpecification): IDeadLetterSpecification {
    return new DeadLetterOrSpecification([this, other]);
  }

  not(): IDeadLetterSpecification {
    return this._spec;
  }

  getInner(): IDeadLetterSpecification {
    return this._spec;
  }
}
