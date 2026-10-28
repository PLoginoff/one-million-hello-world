/**
 * ProxyNotSpecification
 */

import { IProxySpecification } from './IProxySpecification';
import { ProxyAndSpecification } from './ProxyAndSpecification';
import { ProxyOrSpecification } from './ProxyOrSpecification';

export class ProxyNotSpecification implements IProxySpecification {
  private _spec: IProxySpecification;

  constructor(spec: IProxySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IProxySpecification): IProxySpecification {
    return new ProxyAndSpecification([this, other]);
  }

  or(other: IProxySpecification): IProxySpecification {
    return new ProxyOrSpecification([this, other]);
  }

  not(): IProxySpecification {
    return this._spec;
  }

  getInner(): IProxySpecification {
    return this._spec;
  }
}
