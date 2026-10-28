/**
 * CqrsAndSpecification
 */

import { ICqrsSpecification } from './ICqrsSpecification';
import { CqrsOrSpecification } from './CqrsOrSpecification';
import { CqrsNotSpecification } from './CqrsNotSpecification';

export class CqrsAndSpecification implements ICqrsSpecification {
  private _specs: ICqrsSpecification[];

  constructor(specs: ICqrsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICqrsSpecification): ICqrsSpecification {
    return new CqrsAndSpecification([...this._specs, other]);
  }

  or(other: ICqrsSpecification): ICqrsSpecification {
    return new CqrsOrSpecification([this, other]);
  }

  not(): ICqrsSpecification {
    return new CqrsNotSpecification(this);
  }

  getSpecifications(): ICqrsSpecification[] {
    return [...this._specs];
  }
}
