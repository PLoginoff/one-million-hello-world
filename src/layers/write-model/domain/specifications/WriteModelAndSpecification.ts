/**
 * WriteModelAndSpecification
 */

import { IWriteModelSpecification } from './IWriteModelSpecification';
import { WriteModelOrSpecification } from './WriteModelOrSpecification';
import { WriteModelNotSpecification } from './WriteModelNotSpecification';

export class WriteModelAndSpecification implements IWriteModelSpecification {
  private _specs: IWriteModelSpecification[];

  constructor(specs: IWriteModelSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IWriteModelSpecification): IWriteModelSpecification {
    return new WriteModelAndSpecification([...this._specs, other]);
  }

  or(other: IWriteModelSpecification): IWriteModelSpecification {
    return new WriteModelOrSpecification([this, other]);
  }

  not(): IWriteModelSpecification {
    return new WriteModelNotSpecification(this);
  }

  getSpecifications(): IWriteModelSpecification[] {
    return [...this._specs];
  }
}
