/**
 * RulesEngineAndSpecification
 */

import { IRulesEngineSpecification } from './IRulesEngineSpecification';
import { RulesEngineOrSpecification } from './RulesEngineOrSpecification';
import { RulesEngineNotSpecification } from './RulesEngineNotSpecification';

export class RulesEngineAndSpecification implements IRulesEngineSpecification {
  private _specs: IRulesEngineSpecification[];

  constructor(specs: IRulesEngineSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRulesEngineSpecification): IRulesEngineSpecification {
    return new RulesEngineAndSpecification([...this._specs, other]);
  }

  or(other: IRulesEngineSpecification): IRulesEngineSpecification {
    return new RulesEngineOrSpecification([this, other]);
  }

  not(): IRulesEngineSpecification {
    return new RulesEngineNotSpecification(this);
  }

  getSpecifications(): IRulesEngineSpecification[] {
    return [...this._specs];
  }
}
