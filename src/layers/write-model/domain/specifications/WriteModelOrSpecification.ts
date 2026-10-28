/**
 * WriteModelOrSpecification
 */

import { IWriteModelSpecification } from './IWriteModelSpecification';
import { WriteModelAndSpecification } from './WriteModelAndSpecification';
import { WriteModelNotSpecification } from './WriteModelNotSpecification';

export class WriteModelOrSpecification implements IWriteModelSpecification {
  private _specs: IWriteModelSpecification[];

  constructor(specs: IWriteModelSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IWriteModelSpecification): IWriteModelSpecification {
    return new WriteModelAndSpecification([this, other]);
  }

  or(other: IWriteModelSpecification): IWriteModelSpecification {
    return new WriteModelOrSpecification([...this._specs, other]);
  }

  not(): IWriteModelSpecification {
    return new WriteModelNotSpecification(this);
  }

  getSpecifications(): IWriteModelSpecification[] {
    return [...this._specs];
  }
}
