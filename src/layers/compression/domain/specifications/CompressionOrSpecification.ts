/**
 * CompressionOrSpecification
 */

import { ICompressionSpecification } from './ICompressionSpecification';
import { CompressionAndSpecification } from './CompressionAndSpecification';
import { CompressionNotSpecification } from './CompressionNotSpecification';

export class CompressionOrSpecification implements ICompressionSpecification {
  private _specs: ICompressionSpecification[];

  constructor(specs: ICompressionSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICompressionSpecification): ICompressionSpecification {
    return new CompressionAndSpecification([this, other]);
  }

  or(other: ICompressionSpecification): ICompressionSpecification {
    return new CompressionOrSpecification([...this._specs, other]);
  }

  not(): ICompressionSpecification {
    return new CompressionNotSpecification(this);
  }

  getSpecifications(): ICompressionSpecification[] {
    return [...this._specs];
  }
}
