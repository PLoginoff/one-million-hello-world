/**
 * PolicyEngineNotSpecification
 */

import { IPolicyEngineSpecification } from './IPolicyEngineSpecification';
import { PolicyEngineAndSpecification } from './PolicyEngineAndSpecification';
import { PolicyEngineOrSpecification } from './PolicyEngineOrSpecification';

export class PolicyEngineNotSpecification implements IPolicyEngineSpecification {
  private _spec: IPolicyEngineSpecification;

  constructor(spec: IPolicyEngineSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IPolicyEngineSpecification): IPolicyEngineSpecification {
    return new PolicyEngineAndSpecification([this, other]);
  }

  or(other: IPolicyEngineSpecification): IPolicyEngineSpecification {
    return new PolicyEngineOrSpecification([this, other]);
  }

  not(): IPolicyEngineSpecification {
    return this._spec;
  }

  getInner(): IPolicyEngineSpecification {
    return this._spec;
  }
}
