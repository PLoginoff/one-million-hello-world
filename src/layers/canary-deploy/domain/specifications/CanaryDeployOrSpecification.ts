/**
 * CanaryDeployOrSpecification
 */

import { ICanaryDeploySpecification } from './ICanaryDeploySpecification';
import { CanaryDeployAndSpecification } from './CanaryDeployAndSpecification';
import { CanaryDeployNotSpecification } from './CanaryDeployNotSpecification';

export class CanaryDeployOrSpecification implements ICanaryDeploySpecification {
  private _specs: ICanaryDeploySpecification[];

  constructor(specs: ICanaryDeploySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICanaryDeploySpecification): ICanaryDeploySpecification {
    return new CanaryDeployAndSpecification([this, other]);
  }

  or(other: ICanaryDeploySpecification): ICanaryDeploySpecification {
    return new CanaryDeployOrSpecification([...this._specs, other]);
  }

  not(): ICanaryDeploySpecification {
    return new CanaryDeployNotSpecification(this);
  }

  getSpecifications(): ICanaryDeploySpecification[] {
    return [...this._specs];
  }
}
