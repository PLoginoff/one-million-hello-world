/**
 * DeadLetterAndSpecification
 */

import { IDeadLetterSpecification } from './IDeadLetterSpecification';
import { DeadLetterOrSpecification } from './DeadLetterOrSpecification';
import { DeadLetterNotSpecification } from './DeadLetterNotSpecification';

export class DeadLetterAndSpecification implements IDeadLetterSpecification {
  private _specs: IDeadLetterSpecification[];

  constructor(specs: IDeadLetterSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDeadLetterSpecification): IDeadLetterSpecification {
    return new DeadLetterAndSpecification([...this._specs, other]);
  }

  or(other: IDeadLetterSpecification): IDeadLetterSpecification {
    return new DeadLetterOrSpecification([this, other]);
  }

  not(): IDeadLetterSpecification {
    return new DeadLetterNotSpecification(this);
  }

  getSpecifications(): IDeadLetterSpecification[] {
    return [...this._specs];
  }
}
