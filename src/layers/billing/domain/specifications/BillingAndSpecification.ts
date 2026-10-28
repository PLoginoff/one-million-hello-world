/**
 * BillingAndSpecification
 */

import { IBillingSpecification } from './IBillingSpecification';
import { BillingOrSpecification } from './BillingOrSpecification';
import { BillingNotSpecification } from './BillingNotSpecification';

export class BillingAndSpecification implements IBillingSpecification {
  private _specs: IBillingSpecification[];

  constructor(specs: IBillingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBillingSpecification): IBillingSpecification {
    return new BillingAndSpecification([...this._specs, other]);
  }

  or(other: IBillingSpecification): IBillingSpecification {
    return new BillingOrSpecification([this, other]);
  }

  not(): IBillingSpecification {
    return new BillingNotSpecification(this);
  }

  getSpecifications(): IBillingSpecification[] {
    return [...this._specs];
  }
}
