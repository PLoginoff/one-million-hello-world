/**
 * IEtlPipelineSpecification interface
 */

export interface IEtlPipelineSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IEtlPipelineSpecification): IEtlPipelineSpecification;
  or(other: IEtlPipelineSpecification): IEtlPipelineSpecification;
  not(): IEtlPipelineSpecification;
}
