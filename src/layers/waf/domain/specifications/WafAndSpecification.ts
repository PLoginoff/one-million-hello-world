/**
 * WafAndSpecification
 */

import { IWafSpecification } from './IWafSpecification';
import { WafOrSpecification } from './WafOrSpecification';
import { WafNotSpecification } from './WafNotSpecification';

export class WafAndSpecification implements IWafSpecification {
  private _specs: IWafSpecification[];

  constructor(specs: IWafSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IWafSpecification): IWafSpecification {
    return new WafAndSpecification([...this._specs, other]);
  }

  or(other: IWafSpecification): IWafSpecification {
    return new WafOrSpecification([this, other]);
  }

  not(): IWafSpecification {
    return new WafNotSpecification(this);
  }

  getSpecifications(): IWafSpecification[] {
    return [...this._specs];
  }
}
