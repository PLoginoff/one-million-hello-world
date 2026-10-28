/**
 * BillingNotSpecification
 */

import { IBillingSpecification } from './IBillingSpecification';
import { BillingAndSpecification } from './BillingAndSpecification';
import { BillingOrSpecification } from './BillingOrSpecification';

export class BillingNotSpecification implements IBillingSpecification {
  private _spec: IBillingSpecification;

  constructor(spec: IBillingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IBillingSpecification): IBillingSpecification {
    return new BillingAndSpecification([this, other]);
  }

  or(other: IBillingSpecification): IBillingSpecification {
    return new BillingOrSpecification([this, other]);
  }

  not(): IBillingSpecification {
    return this._spec;
  }

  getInner(): IBillingSpecification {
    return this._spec;
  }
}
