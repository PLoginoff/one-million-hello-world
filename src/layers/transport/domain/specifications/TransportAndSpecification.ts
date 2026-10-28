/**
 * TransportAndSpecification
 */

import { ITransportSpecification } from './ITransportSpecification';
import { TransportOrSpecification } from './TransportOrSpecification';
import { TransportNotSpecification } from './TransportNotSpecification';

export class TransportAndSpecification implements ITransportSpecification {
  private _specs: ITransportSpecification[];

  constructor(specs: ITransportSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ITransportSpecification): ITransportSpecification {
    return new TransportAndSpecification([...this._specs, other]);
  }

  or(other: ITransportSpecification): ITransportSpecification {
    return new TransportOrSpecification([this, other]);
  }

  not(): ITransportSpecification {
    return new TransportNotSpecification(this);
  }

  getSpecifications(): ITransportSpecification[] {
    return [...this._specs];
  }
}
