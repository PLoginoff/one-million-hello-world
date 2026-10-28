/**
 * ControllerOrSpecification
 */

import { IControllerSpecification } from './IControllerSpecification';
import { ControllerAndSpecification } from './ControllerAndSpecification';
import { ControllerNotSpecification } from './ControllerNotSpecification';

export class ControllerOrSpecification implements IControllerSpecification {
  private _specs: IControllerSpecification[];

  constructor(specs: IControllerSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IControllerSpecification): IControllerSpecification {
    return new ControllerAndSpecification([this, other]);
  }

  or(other: IControllerSpecification): IControllerSpecification {
    return new ControllerOrSpecification([...this._specs, other]);
  }

  not(): IControllerSpecification {
    return new ControllerNotSpecification(this);
  }

  getSpecifications(): IControllerSpecification[] {
    return [...this._specs];
  }
}
