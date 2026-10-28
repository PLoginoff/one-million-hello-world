/**
 * ControllerNotSpecification
 */

import { IControllerSpecification } from './IControllerSpecification';
import { ControllerAndSpecification } from './ControllerAndSpecification';
import { ControllerOrSpecification } from './ControllerOrSpecification';

export class ControllerNotSpecification implements IControllerSpecification {
  private _spec: IControllerSpecification;

  constructor(spec: IControllerSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IControllerSpecification): IControllerSpecification {
    return new ControllerAndSpecification([this, other]);
  }

  or(other: IControllerSpecification): IControllerSpecification {
    return new ControllerOrSpecification([this, other]);
  }

  not(): IControllerSpecification {
    return this._spec;
  }

  getInner(): IControllerSpecification {
    return this._spec;
  }
}
