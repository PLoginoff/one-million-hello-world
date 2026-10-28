/**
 * EtlPipelineOrSpecification
 */

import { IEtlPipelineSpecification } from './IEtlPipelineSpecification';
import { EtlPipelineAndSpecification } from './EtlPipelineAndSpecification';
import { EtlPipelineNotSpecification } from './EtlPipelineNotSpecification';

export class EtlPipelineOrSpecification implements IEtlPipelineSpecification {
  private _specs: IEtlPipelineSpecification[];

  constructor(specs: IEtlPipelineSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IEtlPipelineSpecification): IEtlPipelineSpecification {
    return new EtlPipelineAndSpecification([this, other]);
  }

  or(other: IEtlPipelineSpecification): IEtlPipelineSpecification {
    return new EtlPipelineOrSpecification([...this._specs, other]);
  }

  not(): IEtlPipelineSpecification {
    return new EtlPipelineNotSpecification(this);
  }

  getSpecifications(): IEtlPipelineSpecification[] {
    return [...this._specs];
  }
}
