/**
 * IWorkflowEngineSpecification interface
 */

export interface IWorkflowEngineSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IWorkflowEngineSpecification): IWorkflowEngineSpecification;
  or(other: IWorkflowEngineSpecification): IWorkflowEngineSpecification;
  not(): IWorkflowEngineSpecification;
}
