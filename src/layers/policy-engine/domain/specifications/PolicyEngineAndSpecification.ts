/**
 * PolicyEngineAndSpecification
 */

import { IPolicyEngineSpecification } from './IPolicyEngineSpecification';
import { PolicyEngineOrSpecification } from './PolicyEngineOrSpecification';
import { PolicyEngineNotSpecification } from './PolicyEngineNotSpecification';

export class PolicyEngineAndSpecification implements IPolicyEngineSpecification {
  private _specs: IPolicyEngineSpecification[];

  constructor(specs: IPolicyEngineSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IPolicyEngineSpecification): IPolicyEngineSpecification {
    return new PolicyEngineAndSpecification([...this._specs, other]);
  }

  or(other: IPolicyEngineSpecification): IPolicyEngineSpecification {
    return new PolicyEngineOrSpecification([this, other]);
  }

  not(): IPolicyEngineSpecification {
    return new PolicyEngineNotSpecification(this);
  }

  getSpecifications(): IPolicyEngineSpecification[] {
    return [...this._specs];
  }
}
