/**
 * CanaryDeployAndSpecification
 */

import { ICanaryDeploySpecification } from './ICanaryDeploySpecification';
import { CanaryDeployOrSpecification } from './CanaryDeployOrSpecification';
import { CanaryDeployNotSpecification } from './CanaryDeployNotSpecification';

export class CanaryDeployAndSpecification implements ICanaryDeploySpecification {
  private _specs: ICanaryDeploySpecification[];

  constructor(specs: ICanaryDeploySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICanaryDeploySpecification): ICanaryDeploySpecification {
    return new CanaryDeployAndSpecification([...this._specs, other]);
  }

  or(other: ICanaryDeploySpecification): ICanaryDeploySpecification {
    return new CanaryDeployOrSpecification([this, other]);
  }

  not(): ICanaryDeploySpecification {
    return new CanaryDeployNotSpecification(this);
  }

  getSpecifications(): ICanaryDeploySpecification[] {
    return [...this._specs];
  }
}
