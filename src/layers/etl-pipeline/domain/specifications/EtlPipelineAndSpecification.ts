/**
 * EtlPipelineAndSpecification
 */

import { IEtlPipelineSpecification } from './IEtlPipelineSpecification';
import { EtlPipelineOrSpecification } from './EtlPipelineOrSpecification';
import { EtlPipelineNotSpecification } from './EtlPipelineNotSpecification';

export class EtlPipelineAndSpecification implements IEtlPipelineSpecification {
  private _specs: IEtlPipelineSpecification[];

  constructor(specs: IEtlPipelineSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IEtlPipelineSpecification): IEtlPipelineSpecification {
    return new EtlPipelineAndSpecification([...this._specs, other]);
  }

  or(other: IEtlPipelineSpecification): IEtlPipelineSpecification {
    return new EtlPipelineOrSpecification([this, other]);
  }

  not(): IEtlPipelineSpecification {
    return new EtlPipelineNotSpecification(this);
  }

  getSpecifications(): IEtlPipelineSpecification[] {
    return [...this._specs];
  }
}
