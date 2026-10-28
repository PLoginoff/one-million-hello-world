/**
 * ProxyAndSpecification
 */

import { IProxySpecification } from './IProxySpecification';
import { ProxyOrSpecification } from './ProxyOrSpecification';
import { ProxyNotSpecification } from './ProxyNotSpecification';

export class ProxyAndSpecification implements IProxySpecification {
  private _specs: IProxySpecification[];

  constructor(specs: IProxySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IProxySpecification): IProxySpecification {
    return new ProxyAndSpecification([...this._specs, other]);
  }

  or(other: IProxySpecification): IProxySpecification {
    return new ProxyOrSpecification([this, other]);
  }

  not(): IProxySpecification {
    return new ProxyNotSpecification(this);
  }

  getSpecifications(): IProxySpecification[] {
    return [...this._specs];
  }
}
