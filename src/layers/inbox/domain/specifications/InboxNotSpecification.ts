/**
 * InboxNotSpecification
 */

import { IInboxSpecification } from './IInboxSpecification';
import { InboxAndSpecification } from './InboxAndSpecification';
import { InboxOrSpecification } from './InboxOrSpecification';

export class InboxNotSpecification implements IInboxSpecification {
  private _spec: IInboxSpecification;

  constructor(spec: IInboxSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IInboxSpecification): IInboxSpecification {
    return new InboxAndSpecification([this, other]);
  }

  or(other: IInboxSpecification): IInboxSpecification {
    return new InboxOrSpecification([this, other]);
  }

  not(): IInboxSpecification {
    return this._spec;
  }

  getInner(): IInboxSpecification {
    return this._spec;
  }
}
