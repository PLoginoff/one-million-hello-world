/**
 * OutboxAndSpecification
 */

import { IOutboxSpecification } from './IOutboxSpecification';
import { OutboxOrSpecification } from './OutboxOrSpecification';
import { OutboxNotSpecification } from './OutboxNotSpecification';

export class OutboxAndSpecification implements IOutboxSpecification {
  private _specs: IOutboxSpecification[];

  constructor(specs: IOutboxSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IOutboxSpecification): IOutboxSpecification {
    return new OutboxAndSpecification([...this._specs, other]);
  }

  or(other: IOutboxSpecification): IOutboxSpecification {
    return new OutboxOrSpecification([this, other]);
  }

  not(): IOutboxSpecification {
    return new OutboxNotSpecification(this);
  }

  getSpecifications(): IOutboxSpecification[] {
    return [...this._specs];
  }
}
