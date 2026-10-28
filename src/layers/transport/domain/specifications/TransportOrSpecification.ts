/**
 * TransportOrSpecification
 */

import { ITransportSpecification } from './ITransportSpecification';
import { TransportAndSpecification } from './TransportAndSpecification';
import { TransportNotSpecification } from './TransportNotSpecification';

export class TransportOrSpecification implements ITransportSpecification {
  private _specs: ITransportSpecification[];

  constructor(specs: ITransportSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ITransportSpecification): ITransportSpecification {
    return new TransportAndSpecification([this, other]);
  }

  or(other: ITransportSpecification): ITransportSpecification {
    return new TransportOrSpecification([...this._specs, other]);
  }

  not(): ITransportSpecification {
    return new TransportNotSpecification(this);
  }

  getSpecifications(): ITransportSpecification[] {
    return [...this._specs];
  }
}
