/**
 * BillingOrSpecification
 */

import { IBillingSpecification } from './IBillingSpecification';
import { BillingAndSpecification } from './BillingAndSpecification';
import { BillingNotSpecification } from './BillingNotSpecification';

export class BillingOrSpecification implements IBillingSpecification {
  private _specs: IBillingSpecification[];

  constructor(specs: IBillingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBillingSpecification): IBillingSpecification {
    return new BillingAndSpecification([this, other]);
  }

  or(other: IBillingSpecification): IBillingSpecification {
    return new BillingOrSpecification([...this._specs, other]);
  }

  not(): IBillingSpecification {
    return new BillingNotSpecification(this);
  }

  getSpecifications(): IBillingSpecification[] {
    return [...this._specs];
  }
}
