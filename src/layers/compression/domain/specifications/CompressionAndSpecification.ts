/**
 * CompressionAndSpecification
 */

import { ICompressionSpecification } from './ICompressionSpecification';
import { CompressionOrSpecification } from './CompressionOrSpecification';
import { CompressionNotSpecification } from './CompressionNotSpecification';

export class CompressionAndSpecification implements ICompressionSpecification {
  private _specs: ICompressionSpecification[];

  constructor(specs: ICompressionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICompressionSpecification): ICompressionSpecification {
    return new CompressionAndSpecification([...this._specs, other]);
  }

  or(other: ICompressionSpecification): ICompressionSpecification {
    return new CompressionOrSpecification([this, other]);
  }

  not(): ICompressionSpecification {
    return new CompressionNotSpecification(this);
  }

  getSpecifications(): ICompressionSpecification[] {
    return [...this._specs];
  }
}
