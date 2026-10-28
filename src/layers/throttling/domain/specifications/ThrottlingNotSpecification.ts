/**
 * ThrottlingNotSpecification
 */

import { IThrottlingSpecification } from './IThrottlingSpecification';
import { ThrottlingAndSpecification } from './ThrottlingAndSpecification';
import { ThrottlingOrSpecification } from './ThrottlingOrSpecification';

export class ThrottlingNotSpecification implements IThrottlingSpecification {
  private _spec: IThrottlingSpecification;

  constructor(spec: IThrottlingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IThrottlingSpecification): IThrottlingSpecification {
    return new ThrottlingAndSpecification([this, other]);
  }

  or(other: IThrottlingSpecification): IThrottlingSpecification {
    return new ThrottlingOrSpecification([this, other]);
  }

  not(): IThrottlingSpecification {
    return this._spec;
  }

  getInner(): IThrottlingSpecification {
    return this._spec;
  }
}
