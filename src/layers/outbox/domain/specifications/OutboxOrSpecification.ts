/**
 * OutboxOrSpecification
 */

import { IOutboxSpecification } from './IOutboxSpecification';
import { OutboxAndSpecification } from './OutboxAndSpecification';
import { OutboxNotSpecification } from './OutboxNotSpecification';

export class OutboxOrSpecification implements IOutboxSpecification {
  private _specs: IOutboxSpecification[];

  constructor(specs: IOutboxSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IOutboxSpecification): IOutboxSpecification {
    return new OutboxAndSpecification([this, other]);
  }

  or(other: IOutboxSpecification): IOutboxSpecification {
    return new OutboxOrSpecification([...this._specs, other]);
  }

  not(): IOutboxSpecification {
    return new OutboxNotSpecification(this);
  }

  getSpecifications(): IOutboxSpecification[] {
    return [...this._specs];
  }
}
