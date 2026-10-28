/**
 * WorkflowEngineNotSpecification
 */

import { IWorkflowEngineSpecification } from './IWorkflowEngineSpecification';
import { WorkflowEngineAndSpecification } from './WorkflowEngineAndSpecification';
import { WorkflowEngineOrSpecification } from './WorkflowEngineOrSpecification';

export class WorkflowEngineNotSpecification implements IWorkflowEngineSpecification {
  private _spec: IWorkflowEngineSpecification;

  constructor(spec: IWorkflowEngineSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IWorkflowEngineSpecification): IWorkflowEngineSpecification {
    return new WorkflowEngineAndSpecification([this, other]);
  }

  or(other: IWorkflowEngineSpecification): IWorkflowEngineSpecification {
    return new WorkflowEngineOrSpecification([this, other]);
  }

  not(): IWorkflowEngineSpecification {
    return this._spec;
  }

  getInner(): IWorkflowEngineSpecification {
    return this._spec;
  }
}
