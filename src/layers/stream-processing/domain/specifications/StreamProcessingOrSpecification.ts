/**
 * StreamProcessingOrSpecification
 */

import { IStreamProcessingSpecification } from './IStreamProcessingSpecification';
import { StreamProcessingAndSpecification } from './StreamProcessingAndSpecification';
import { StreamProcessingNotSpecification } from './StreamProcessingNotSpecification';

export class StreamProcessingOrSpecification implements IStreamProcessingSpecification {
  private _specs: IStreamProcessingSpecification[];

  constructor(specs: IStreamProcessingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IStreamProcessingSpecification): IStreamProcessingSpecification {
    return new StreamProcessingAndSpecification([this, other]);
  }

  or(other: IStreamProcessingSpecification): IStreamProcessingSpecification {
    return new StreamProcessingOrSpecification([...this._specs, other]);
  }

  not(): IStreamProcessingSpecification {
    return new StreamProcessingNotSpecification(this);
  }

  getSpecifications(): IStreamProcessingSpecification[] {
    return [...this._specs];
  }
}
