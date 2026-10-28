/**
 * InboxAndSpecification
 */

import { IInboxSpecification } from './IInboxSpecification';
import { InboxOrSpecification } from './InboxOrSpecification';
import { InboxNotSpecification } from './InboxNotSpecification';

export class InboxAndSpecification implements IInboxSpecification {
  private _specs: IInboxSpecification[];

  constructor(specs: IInboxSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IInboxSpecification): IInboxSpecification {
    return new InboxAndSpecification([...this._specs, other]);
  }

  or(other: IInboxSpecification): IInboxSpecification {
    return new InboxOrSpecification([this, other]);
  }

  not(): IInboxSpecification {
    return new InboxNotSpecification(this);
  }

  getSpecifications(): IInboxSpecification[] {
    return [...this._specs];
  }
}
