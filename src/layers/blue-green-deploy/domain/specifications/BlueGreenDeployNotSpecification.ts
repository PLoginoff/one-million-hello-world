/**
 * BlueGreenDeployNotSpecification
 */

import { IBlueGreenDeploySpecification } from './IBlueGreenDeploySpecification';
import { BlueGreenDeployAndSpecification } from './BlueGreenDeployAndSpecification';
import { BlueGreenDeployOrSpecification } from './BlueGreenDeployOrSpecification';

export class BlueGreenDeployNotSpecification implements IBlueGreenDeploySpecification {
  private _spec: IBlueGreenDeploySpecification;

  constructor(spec: IBlueGreenDeploySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IBlueGreenDeploySpecification): IBlueGreenDeploySpecification {
    return new BlueGreenDeployAndSpecification([this, other]);
  }

  or(other: IBlueGreenDeploySpecification): IBlueGreenDeploySpecification {
    return new BlueGreenDeployOrSpecification([this, other]);
  }

  not(): IBlueGreenDeploySpecification {
    return this._spec;
  }

  getInner(): IBlueGreenDeploySpecification {
    return this._spec;
  }
}
