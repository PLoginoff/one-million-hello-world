/**
 * WriteModelNotSpecification
 */

import { IWriteModelSpecification } from './IWriteModelSpecification';
import { WriteModelAndSpecification } from './WriteModelAndSpecification';
import { WriteModelOrSpecification } from './WriteModelOrSpecification';

export class WriteModelNotSpecification implements IWriteModelSpecification {
  private _spec: IWriteModelSpecification;

  constructor(spec: IWriteModelSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IWriteModelSpecification): IWriteModelSpecification {
    return new WriteModelAndSpecification([this, other]);
  }

  or(other: IWriteModelSpecification): IWriteModelSpecification {
    return new WriteModelOrSpecification([this, other]);
  }

  not(): IWriteModelSpecification {
    return this._spec;
  }

  getInner(): IWriteModelSpecification {
    return this._spec;
  }
}
