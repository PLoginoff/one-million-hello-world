/**
 * ReadModelNotSpecification
 */

import { IReadModelSpecification } from './IReadModelSpecification';
import { ReadModelAndSpecification } from './ReadModelAndSpecification';
import { ReadModelOrSpecification } from './ReadModelOrSpecification';

export class ReadModelNotSpecification implements IReadModelSpecification {
  private _spec: IReadModelSpecification;

  constructor(spec: IReadModelSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IReadModelSpecification): IReadModelSpecification {
    return new ReadModelAndSpecification([this, other]);
  }

  or(other: IReadModelSpecification): IReadModelSpecification {
    return new ReadModelOrSpecification([this, other]);
  }

  not(): IReadModelSpecification {
    return this._spec;
  }

  getInner(): IReadModelSpecification {
    return this._spec;
  }
}
