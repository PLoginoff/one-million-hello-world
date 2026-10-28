/**
 * WafNotSpecification
 */

import { IWafSpecification } from './IWafSpecification';
import { WafAndSpecification } from './WafAndSpecification';
import { WafOrSpecification } from './WafOrSpecification';

export class WafNotSpecification implements IWafSpecification {
  private _spec: IWafSpecification;

  constructor(spec: IWafSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IWafSpecification): IWafSpecification {
    return new WafAndSpecification([this, other]);
  }

  or(other: IWafSpecification): IWafSpecification {
    return new WafOrSpecification([this, other]);
  }

  not(): IWafSpecification {
    return this._spec;
  }

  getInner(): IWafSpecification {
    return this._spec;
  }
}
