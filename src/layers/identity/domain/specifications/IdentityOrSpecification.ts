/**
 * IdentityOrSpecification
 */

import { IIdentitySpecification } from './IIdentitySpecification';
import { IdentityAndSpecification } from './IdentityAndSpecification';
import { IdentityNotSpecification } from './IdentityNotSpecification';

export class IdentityOrSpecification implements IIdentitySpecification {
  private _specs: IIdentitySpecification[];

  constructor(specs: IIdentitySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IIdentitySpecification): IIdentitySpecification {
    return new IdentityAndSpecification([this, other]);
  }

  or(other: IIdentitySpecification): IIdentitySpecification {
    return new IdentityOrSpecification([...this._specs, other]);
  }

  not(): IIdentitySpecification {
    return new IdentityNotSpecification(this);
  }

  getSpecifications(): IIdentitySpecification[] {
    return [...this._specs];
  }
}
