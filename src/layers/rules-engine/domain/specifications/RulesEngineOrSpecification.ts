/**
 * RulesEngineOrSpecification
 */

import { IRulesEngineSpecification } from './IRulesEngineSpecification';
import { RulesEngineAndSpecification } from './RulesEngineAndSpecification';
import { RulesEngineNotSpecification } from './RulesEngineNotSpecification';

export class RulesEngineOrSpecification implements IRulesEngineSpecification {
  private _specs: IRulesEngineSpecification[];

  constructor(specs: IRulesEngineSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRulesEngineSpecification): IRulesEngineSpecification {
    return new RulesEngineAndSpecification([this, other]);
  }

  or(other: IRulesEngineSpecification): IRulesEngineSpecification {
    return new RulesEngineOrSpecification([...this._specs, other]);
  }

  not(): IRulesEngineSpecification {
    return new RulesEngineNotSpecification(this);
  }

  getSpecifications(): IRulesEngineSpecification[] {
    return [...this._specs];
  }
}
