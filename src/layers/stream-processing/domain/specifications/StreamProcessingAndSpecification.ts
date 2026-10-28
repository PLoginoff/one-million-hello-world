/**
 * StreamProcessingAndSpecification
 */

import { IStreamProcessingSpecification } from './IStreamProcessingSpecification';
import { StreamProcessingOrSpecification } from './StreamProcessingOrSpecification';
import { StreamProcessingNotSpecification } from './StreamProcessingNotSpecification';

export class StreamProcessingAndSpecification implements IStreamProcessingSpecification {
  private _specs: IStreamProcessingSpecification[];

  constructor(specs: IStreamProcessingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IStreamProcessingSpecification): IStreamProcessingSpecification {
    return new StreamProcessingAndSpecification([...this._specs, other]);
  }

  or(other: IStreamProcessingSpecification): IStreamProcessingSpecification {
    return new StreamProcessingOrSpecification([this, other]);
  }

  not(): IStreamProcessingSpecification {
    return new StreamProcessingNotSpecification(this);
  }

  getSpecifications(): IStreamProcessingSpecification[] {
    return [...this._specs];
  }
}
