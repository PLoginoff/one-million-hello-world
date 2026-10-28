/**
 * BlueGreenDeployAndSpecification
 */

import { IBlueGreenDeploySpecification } from './IBlueGreenDeploySpecification';
import { BlueGreenDeployOrSpecification } from './BlueGreenDeployOrSpecification';
import { BlueGreenDeployNotSpecification } from './BlueGreenDeployNotSpecification';

export class BlueGreenDeployAndSpecification implements IBlueGreenDeploySpecification {
  private _specs: IBlueGreenDeploySpecification[];

  constructor(specs: IBlueGreenDeploySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBlueGreenDeploySpecification): IBlueGreenDeploySpecification {
    return new BlueGreenDeployAndSpecification([...this._specs, other]);
  }

  or(other: IBlueGreenDeploySpecification): IBlueGreenDeploySpecification {
    return new BlueGreenDeployOrSpecification([this, other]);
  }

  not(): IBlueGreenDeploySpecification {
    return new BlueGreenDeployNotSpecification(this);
  }

  getSpecifications(): IBlueGreenDeploySpecification[] {
    return [...this._specs];
  }
}
