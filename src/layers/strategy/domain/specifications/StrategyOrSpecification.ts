/**
 * StrategyOrSpecification
 */

import { IStrategySpecification } from './IStrategySpecification';
import { StrategyAndSpecification } from './StrategyAndSpecification';
import { StrategyNotSpecification } from './StrategyNotSpecification';

export class StrategyOrSpecification implements IStrategySpecification {
  private _specs: IStrategySpecification[];

  constructor(specs: IStrategySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IStrategySpecification): IStrategySpecification {
    return new StrategyAndSpecification([this, other]);
  }

  or(other: IStrategySpecification): IStrategySpecification {
    return new StrategyOrSpecification([...this._specs, other]);
  }

  not(): IStrategySpecification {
    return new StrategyNotSpecification(this);
  }

  getSpecifications(): IStrategySpecification[] {
    return [...this._specs];
  }
}
