/**
 * CqrsNotSpecification
 */

import { ICqrsSpecification } from './ICqrsSpecification';
import { CqrsAndSpecification } from './CqrsAndSpecification';
import { CqrsOrSpecification } from './CqrsOrSpecification';

export class CqrsNotSpecification implements ICqrsSpecification {
  private _spec: ICqrsSpecification;

  constructor(spec: ICqrsSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ICqrsSpecification): ICqrsSpecification {
    return new CqrsAndSpecification([this, other]);
  }

  or(other: ICqrsSpecification): ICqrsSpecification {
    return new CqrsOrSpecification([this, other]);
  }

  not(): ICqrsSpecification {
    return this._spec;
  }

  getInner(): ICqrsSpecification {
    return this._spec;
  }
}
