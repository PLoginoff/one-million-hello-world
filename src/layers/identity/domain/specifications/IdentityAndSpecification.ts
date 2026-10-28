/**
 * IdentityAndSpecification
 */

import { IIdentitySpecification } from './IIdentitySpecification';
import { IdentityOrSpecification } from './IdentityOrSpecification';
import { IdentityNotSpecification } from './IdentityNotSpecification';

export class IdentityAndSpecification implements IIdentitySpecification {
  private _specs: IIdentitySpecification[];

  constructor(specs: IIdentitySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IIdentitySpecification): IIdentitySpecification {
    return new IdentityAndSpecification([...this._specs, other]);
  }

  or(other: IIdentitySpecification): IIdentitySpecification {
    return new IdentityOrSpecification([this, other]);
  }

  not(): IIdentitySpecification {
    return new IdentityNotSpecification(this);
  }

  getSpecifications(): IIdentitySpecification[] {
    return [...this._specs];
  }
}
