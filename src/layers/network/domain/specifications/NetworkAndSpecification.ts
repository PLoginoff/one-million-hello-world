/**
 * NetworkAndSpecification
 */

import { INetworkSpecification } from './INetworkSpecification';
import { NetworkOrSpecification } from './NetworkOrSpecification';
import { NetworkNotSpecification } from './NetworkNotSpecification';

export class NetworkAndSpecification implements INetworkSpecification {
  private _specs: INetworkSpecification[];

  constructor(specs: INetworkSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: INetworkSpecification): INetworkSpecification {
    return new NetworkAndSpecification([...this._specs, other]);
  }

  or(other: INetworkSpecification): INetworkSpecification {
    return new NetworkOrSpecification([this, other]);
  }

  not(): INetworkSpecification {
    return new NetworkNotSpecification(this);
  }

  getSpecifications(): INetworkSpecification[] {
    return [...this._specs];
  }
}
