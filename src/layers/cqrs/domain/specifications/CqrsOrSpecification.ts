/**
 * CqrsOrSpecification
 */

import { ICqrsSpecification } from './ICqrsSpecification';
import { CqrsAndSpecification } from './CqrsAndSpecification';
import { CqrsNotSpecification } from './CqrsNotSpecification';

export class CqrsOrSpecification implements ICqrsSpecification {
  private _specs: ICqrsSpecification[];

  constructor(specs: ICqrsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICqrsSpecification): ICqrsSpecification {
    return new CqrsAndSpecification([this, other]);
  }

  or(other: ICqrsSpecification): ICqrsSpecification {
    return new CqrsOrSpecification([...this._specs, other]);
  }

  not(): ICqrsSpecification {
    return new CqrsNotSpecification(this);
  }

  getSpecifications(): ICqrsSpecification[] {
    return [...this._specs];
  }
}
