/**
 * SiemNotSpecification
 */

import { ISiemSpecification } from './ISiemSpecification';
import { SiemAndSpecification } from './SiemAndSpecification';
import { SiemOrSpecification } from './SiemOrSpecification';

export class SiemNotSpecification implements ISiemSpecification {
  private _spec: ISiemSpecification;

  constructor(spec: ISiemSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISiemSpecification): ISiemSpecification {
    return new SiemAndSpecification([this, other]);
  }

  or(other: ISiemSpecification): ISiemSpecification {
    return new SiemOrSpecification([this, other]);
  }

  not(): ISiemSpecification {
    return this._spec;
  }

  getInner(): ISiemSpecification {
    return this._spec;
  }
}
