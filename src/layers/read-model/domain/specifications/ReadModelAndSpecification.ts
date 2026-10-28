/**
 * ReadModelAndSpecification
 */

import { IReadModelSpecification } from './IReadModelSpecification';
import { ReadModelOrSpecification } from './ReadModelOrSpecification';
import { ReadModelNotSpecification } from './ReadModelNotSpecification';

export class ReadModelAndSpecification implements IReadModelSpecification {
  private _specs: IReadModelSpecification[];

  constructor(specs: IReadModelSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IReadModelSpecification): IReadModelSpecification {
    return new ReadModelAndSpecification([...this._specs, other]);
  }

  or(other: IReadModelSpecification): IReadModelSpecification {
    return new ReadModelOrSpecification([this, other]);
  }

  not(): IReadModelSpecification {
    return new ReadModelNotSpecification(this);
  }

  getSpecifications(): IReadModelSpecification[] {
    return [...this._specs];
  }
}
