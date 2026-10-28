/**
 * CompressionNotSpecification
 */

import { ICompressionSpecification } from './ICompressionSpecification';
import { CompressionAndSpecification } from './CompressionAndSpecification';
import { CompressionOrSpecification } from './CompressionOrSpecification';

export class CompressionNotSpecification implements ICompressionSpecification {
  private _spec: ICompressionSpecification;

  constructor(spec: ICompressionSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ICompressionSpecification): ICompressionSpecification {
    return new CompressionAndSpecification([this, other]);
  }

  or(other: ICompressionSpecification): ICompressionSpecification {
    return new CompressionOrSpecification([this, other]);
  }

  not(): ICompressionSpecification {
    return this._spec;
  }

  getInner(): ICompressionSpecification {
    return this._spec;
  }
}
