/**
 * StrategyAndSpecification
 */

import { IStrategySpecification } from './IStrategySpecification';
import { StrategyOrSpecification } from './StrategyOrSpecification';
import { StrategyNotSpecification } from './StrategyNotSpecification';

export class StrategyAndSpecification implements IStrategySpecification {
  private _specs: IStrategySpecification[];

  constructor(specs: IStrategySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IStrategySpecification): IStrategySpecification {
    return new StrategyAndSpecification([...this._specs, other]);
  }

  or(other: IStrategySpecification): IStrategySpecification {
    return new StrategyOrSpecification([this, other]);
  }

  not(): IStrategySpecification {
    return new StrategyNotSpecification(this);
  }

  getSpecifications(): IStrategySpecification[] {
    return [...this._specs];
  }
}
