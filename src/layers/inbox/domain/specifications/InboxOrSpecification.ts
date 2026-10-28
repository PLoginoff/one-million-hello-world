/**
 * InboxOrSpecification
 */

import { IInboxSpecification } from './IInboxSpecification';
import { InboxAndSpecification } from './InboxAndSpecification';
import { InboxNotSpecification } from './InboxNotSpecification';

export class InboxOrSpecification implements IInboxSpecification {
  private _specs: IInboxSpecification[];

  constructor(specs: IInboxSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IInboxSpecification): IInboxSpecification {
    return new InboxAndSpecification([this, other]);
  }

  or(other: IInboxSpecification): IInboxSpecification {
    return new InboxOrSpecification([...this._specs, other]);
  }

  not(): IInboxSpecification {
    return new InboxNotSpecification(this);
  }

  getSpecifications(): IInboxSpecification[] {
    return [...this._specs];
  }
}
