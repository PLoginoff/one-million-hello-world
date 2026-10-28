/**
 * BlueGreenDeployOrSpecification
 */

import { IBlueGreenDeploySpecification } from './IBlueGreenDeploySpecification';
import { BlueGreenDeployAndSpecification } from './BlueGreenDeployAndSpecification';
import { BlueGreenDeployNotSpecification } from './BlueGreenDeployNotSpecification';

export class BlueGreenDeployOrSpecification implements IBlueGreenDeploySpecification {
  private _specs: IBlueGreenDeploySpecification[];

  constructor(specs: IBlueGreenDeploySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBlueGreenDeploySpecification): IBlueGreenDeploySpecification {
    return new BlueGreenDeployAndSpecification([this, other]);
  }

  or(other: IBlueGreenDeploySpecification): IBlueGreenDeploySpecification {
    return new BlueGreenDeployOrSpecification([...this._specs, other]);
  }

  not(): IBlueGreenDeploySpecification {
    return new BlueGreenDeployNotSpecification(this);
  }

  getSpecifications(): IBlueGreenDeploySpecification[] {
    return [...this._specs];
  }
}
