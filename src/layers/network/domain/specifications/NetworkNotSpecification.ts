/**
 * NetworkNotSpecification
 */

import { INetworkSpecification } from './INetworkSpecification';
import { NetworkAndSpecification } from './NetworkAndSpecification';
import { NetworkOrSpecification } from './NetworkOrSpecification';

export class NetworkNotSpecification implements INetworkSpecification {
  private _spec: INetworkSpecification;

  constructor(spec: INetworkSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: INetworkSpecification): INetworkSpecification {
    return new NetworkAndSpecification([this, other]);
  }

  or(other: INetworkSpecification): INetworkSpecification {
    return new NetworkOrSpecification([this, other]);
  }

  not(): INetworkSpecification {
    return this._spec;
  }

  getInner(): INetworkSpecification {
    return this._spec;
  }
}
