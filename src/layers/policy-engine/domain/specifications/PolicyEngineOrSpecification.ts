/**
 * PolicyEngineOrSpecification
 */

import { IPolicyEngineSpecification } from './IPolicyEngineSpecification';
import { PolicyEngineAndSpecification } from './PolicyEngineAndSpecification';
import { PolicyEngineNotSpecification } from './PolicyEngineNotSpecification';

export class PolicyEngineOrSpecification implements IPolicyEngineSpecification {
  private _specs: IPolicyEngineSpecification[];

  constructor(specs: IPolicyEngineSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IPolicyEngineSpecification): IPolicyEngineSpecification {
    return new PolicyEngineAndSpecification([this, other]);
  }

  or(other: IPolicyEngineSpecification): IPolicyEngineSpecification {
    return new PolicyEngineOrSpecification([...this._specs, other]);
  }

  not(): IPolicyEngineSpecification {
    return new PolicyEngineNotSpecification(this);
  }

  getSpecifications(): IPolicyEngineSpecification[] {
    return [...this._specs];
  }
}
