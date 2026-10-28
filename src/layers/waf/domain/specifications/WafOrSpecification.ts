/**
 * WafOrSpecification
 */

import { IWafSpecification } from './IWafSpecification';
import { WafAndSpecification } from './WafAndSpecification';
import { WafNotSpecification } from './WafNotSpecification';

export class WafOrSpecification implements IWafSpecification {
  private _specs: IWafSpecification[];

  constructor(specs: IWafSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IWafSpecification): IWafSpecification {
    return new WafAndSpecification([this, other]);
  }

  or(other: IWafSpecification): IWafSpecification {
    return new WafOrSpecification([...this._specs, other]);
  }

  not(): IWafSpecification {
    return new WafNotSpecification(this);
  }

  getSpecifications(): IWafSpecification[] {
    return [...this._specs];
  }
}
