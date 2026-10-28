/**
 * TransportNotSpecification
 */

import { ITransportSpecification } from './ITransportSpecification';
import { TransportAndSpecification } from './TransportAndSpecification';
import { TransportOrSpecification } from './TransportOrSpecification';

export class TransportNotSpecification implements ITransportSpecification {
  private _spec: ITransportSpecification;

  constructor(spec: ITransportSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ITransportSpecification): ITransportSpecification {
    return new TransportAndSpecification([this, other]);
  }

  or(other: ITransportSpecification): ITransportSpecification {
    return new TransportOrSpecification([this, other]);
  }

  not(): ITransportSpecification {
    return this._spec;
  }

  getInner(): ITransportSpecification {
    return this._spec;
  }
}
