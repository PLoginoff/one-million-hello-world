/**
 * StreamProcessingNotSpecification
 */

import { IStreamProcessingSpecification } from './IStreamProcessingSpecification';
import { StreamProcessingAndSpecification } from './StreamProcessingAndSpecification';
import { StreamProcessingOrSpecification } from './StreamProcessingOrSpecification';

export class StreamProcessingNotSpecification implements IStreamProcessingSpecification {
  private _spec: IStreamProcessingSpecification;

  constructor(spec: IStreamProcessingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IStreamProcessingSpecification): IStreamProcessingSpecification {
    return new StreamProcessingAndSpecification([this, other]);
  }

  or(other: IStreamProcessingSpecification): IStreamProcessingSpecification {
    return new StreamProcessingOrSpecification([this, other]);
  }

  not(): IStreamProcessingSpecification {
    return this._spec;
  }

  getInner(): IStreamProcessingSpecification {
    return this._spec;
  }
}
