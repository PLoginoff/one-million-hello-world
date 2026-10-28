/**
 * NetworkOrSpecification
 */

import { INetworkSpecification } from './INetworkSpecification';
import { NetworkAndSpecification } from './NetworkAndSpecification';
import { NetworkNotSpecification } from './NetworkNotSpecification';

export class NetworkOrSpecification implements INetworkSpecification {
  private _specs: INetworkSpecification[];

  constructor(specs: INetworkSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: INetworkSpecification): INetworkSpecification {
    return new NetworkAndSpecification([this, other]);
  }

  or(other: INetworkSpecification): INetworkSpecification {
    return new NetworkOrSpecification([...this._specs, other]);
  }

  not(): INetworkSpecification {
    return new NetworkNotSpecification(this);
  }

  getSpecifications(): INetworkSpecification[] {
    return [...this._specs];
  }
}
