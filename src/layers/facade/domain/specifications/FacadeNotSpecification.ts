/**
 * FacadeNotSpecification
 */

import { IFacadeSpecification } from './IFacadeSpecification';
import { FacadeAndSpecification } from './FacadeAndSpecification';
import { FacadeOrSpecification } from './FacadeOrSpecification';

export class FacadeNotSpecification implements IFacadeSpecification {
  private _spec: IFacadeSpecification;

  constructor(spec: IFacadeSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IFacadeSpecification): IFacadeSpecification {
    return new FacadeAndSpecification([this, other]);
  }

  or(other: IFacadeSpecification): IFacadeSpecification {
    return new FacadeOrSpecification([this, other]);
  }

  not(): IFacadeSpecification {
    return this._spec;
  }

  getInner(): IFacadeSpecification {
    return this._spec;
  }
}
