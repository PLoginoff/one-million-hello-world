/**
 * ControllerAndSpecification
 */

import { IControllerSpecification } from './IControllerSpecification';
import { ControllerOrSpecification } from './ControllerOrSpecification';
import { ControllerNotSpecification } from './ControllerNotSpecification';

export class ControllerAndSpecification implements IControllerSpecification {
  private _specs: IControllerSpecification[];

  constructor(specs: IControllerSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IControllerSpecification): IControllerSpecification {
    return new ControllerAndSpecification([...this._specs, other]);
  }

  or(other: IControllerSpecification): IControllerSpecification {
    return new ControllerOrSpecification([this, other]);
  }

  not(): IControllerSpecification {
    return new ControllerNotSpecification(this);
  }

  getSpecifications(): IControllerSpecification[] {
    return [...this._specs];
  }
}
