/**
 * ReadModelOrSpecification
 */

import { IReadModelSpecification } from './IReadModelSpecification';
import { ReadModelAndSpecification } from './ReadModelAndSpecification';
import { ReadModelNotSpecification } from './ReadModelNotSpecification';

export class ReadModelOrSpecification implements IReadModelSpecification {
  private _specs: IReadModelSpecification[];

  constructor(specs: IReadModelSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IReadModelSpecification): IReadModelSpecification {
    return new ReadModelAndSpecification([this, other]);
  }

  or(other: IReadModelSpecification): IReadModelSpecification {
    return new ReadModelOrSpecification([...this._specs, other]);
  }

  not(): IReadModelSpecification {
    return new ReadModelNotSpecification(this);
  }

  getSpecifications(): IReadModelSpecification[] {
    return [...this._specs];
  }
}
