/**
 * StrategyNotSpecification
 */

import { IStrategySpecification } from './IStrategySpecification';
import { StrategyAndSpecification } from './StrategyAndSpecification';
import { StrategyOrSpecification } from './StrategyOrSpecification';

export class StrategyNotSpecification implements IStrategySpecification {
  private _spec: IStrategySpecification;

  constructor(spec: IStrategySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IStrategySpecification): IStrategySpecification {
    return new StrategyAndSpecification([this, other]);
  }

  or(other: IStrategySpecification): IStrategySpecification {
    return new StrategyOrSpecification([this, other]);
  }

  not(): IStrategySpecification {
    return this._spec;
  }

  getInner(): IStrategySpecification {
    return this._spec;
  }
}
