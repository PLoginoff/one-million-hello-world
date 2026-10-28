/**
 * EtlPipelineNotSpecification
 */

import { IEtlPipelineSpecification } from './IEtlPipelineSpecification';
import { EtlPipelineAndSpecification } from './EtlPipelineAndSpecification';
import { EtlPipelineOrSpecification } from './EtlPipelineOrSpecification';

export class EtlPipelineNotSpecification implements IEtlPipelineSpecification {
  private _spec: IEtlPipelineSpecification;

  constructor(spec: IEtlPipelineSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IEtlPipelineSpecification): IEtlPipelineSpecification {
    return new EtlPipelineAndSpecification([this, other]);
  }

  or(other: IEtlPipelineSpecification): IEtlPipelineSpecification {
    return new EtlPipelineOrSpecification([this, other]);
  }

  not(): IEtlPipelineSpecification {
    return this._spec;
  }

  getInner(): IEtlPipelineSpecification {
    return this._spec;
  }
}
