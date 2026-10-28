/**
 * SsoAndSpecification
 */

import { ISsoSpecification } from './ISsoSpecification';
import { SsoOrSpecification } from './SsoOrSpecification';
import { SsoNotSpecification } from './SsoNotSpecification';

export class SsoAndSpecification implements ISsoSpecification {
  private _specs: ISsoSpecification[];

  constructor(specs: ISsoSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISsoSpecification): ISsoSpecification {
    return new SsoAndSpecification([...this._specs, other]);
  }

  or(other: ISsoSpecification): ISsoSpecification {
    return new SsoOrSpecification([this, other]);
  }

  not(): ISsoSpecification {
    return new SsoNotSpecification(this);
  }

  getSpecifications(): ISsoSpecification[] {
    return [...this._specs];
  }
}
