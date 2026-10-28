/**
 * DeadLetterOrSpecification
 */

import { IDeadLetterSpecification } from './IDeadLetterSpecification';
import { DeadLetterAndSpecification } from './DeadLetterAndSpecification';
import { DeadLetterNotSpecification } from './DeadLetterNotSpecification';

export class DeadLetterOrSpecification implements IDeadLetterSpecification {
  private _specs: IDeadLetterSpecification[];

  constructor(specs: IDeadLetterSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IDeadLetterSpecification): IDeadLetterSpecification {
    return new DeadLetterAndSpecification([this, other]);
  }

  or(other: IDeadLetterSpecification): IDeadLetterSpecification {
    return new DeadLetterOrSpecification([...this._specs, other]);
  }

  not(): IDeadLetterSpecification {
    return new DeadLetterNotSpecification(this);
  }

  getSpecifications(): IDeadLetterSpecification[] {
    return [...this._specs];
  }
}
