/**
 * SsoOrSpecification
 */

import { ISsoSpecification } from './ISsoSpecification';
import { SsoAndSpecification } from './SsoAndSpecification';
import { SsoNotSpecification } from './SsoNotSpecification';

export class SsoOrSpecification implements ISsoSpecification {
  private _specs: ISsoSpecification[];

  constructor(specs: ISsoSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISsoSpecification): ISsoSpecification {
    return new SsoAndSpecification([this, other]);
  }

  or(other: ISsoSpecification): ISsoSpecification {
    return new SsoOrSpecification([...this._specs, other]);
  }

  not(): ISsoSpecification {
    return new SsoNotSpecification(this);
  }

  getSpecifications(): ISsoSpecification[] {
    return [...this._specs];
  }
}
