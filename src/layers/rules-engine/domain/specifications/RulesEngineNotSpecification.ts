/**
 * RulesEngineNotSpecification
 */

import { IRulesEngineSpecification } from './IRulesEngineSpecification';
import { RulesEngineAndSpecification } from './RulesEngineAndSpecification';
import { RulesEngineOrSpecification } from './RulesEngineOrSpecification';

export class RulesEngineNotSpecification implements IRulesEngineSpecification {
  private _spec: IRulesEngineSpecification;

  constructor(spec: IRulesEngineSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IRulesEngineSpecification): IRulesEngineSpecification {
    return new RulesEngineAndSpecification([this, other]);
  }

  or(other: IRulesEngineSpecification): IRulesEngineSpecification {
    return new RulesEngineOrSpecification([this, other]);
  }

  not(): IRulesEngineSpecification {
    return this._spec;
  }

  getInner(): IRulesEngineSpecification {
    return this._spec;
  }
}
