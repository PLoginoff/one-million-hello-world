/**
 * ProxyOrSpecification
 */

import { IProxySpecification } from './IProxySpecification';
import { ProxyAndSpecification } from './ProxyAndSpecification';
import { ProxyNotSpecification } from './ProxyNotSpecification';

export class ProxyOrSpecification implements IProxySpecification {
  private _specs: IProxySpecification[];

  constructor(specs: IProxySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IProxySpecification): IProxySpecification {
    return new ProxyAndSpecification([this, other]);
  }

  or(other: IProxySpecification): IProxySpecification {
    return new ProxyOrSpecification([...this._specs, other]);
  }

  not(): IProxySpecification {
    return new ProxyNotSpecification(this);
  }

  getSpecifications(): IProxySpecification[] {
    return [...this._specs];
  }
}
