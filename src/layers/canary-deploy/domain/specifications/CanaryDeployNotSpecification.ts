/**
 * CanaryDeployNotSpecification
 */

import { ICanaryDeploySpecification } from './ICanaryDeploySpecification';
import { CanaryDeployAndSpecification } from './CanaryDeployAndSpecification';
import { CanaryDeployOrSpecification } from './CanaryDeployOrSpecification';

export class CanaryDeployNotSpecification implements ICanaryDeploySpecification {
  private _spec: ICanaryDeploySpecification;

  constructor(spec: ICanaryDeploySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ICanaryDeploySpecification): ICanaryDeploySpecification {
    return new CanaryDeployAndSpecification([this, other]);
  }

  or(other: ICanaryDeploySpecification): ICanaryDeploySpecification {
    return new CanaryDeployOrSpecification([this, other]);
  }

  not(): ICanaryDeploySpecification {
    return this._spec;
  }

  getInner(): ICanaryDeploySpecification {
    return this._spec;
  }
}
