/**
 * WorkflowEngineOrSpecification
 */

import { IWorkflowEngineSpecification } from './IWorkflowEngineSpecification';
import { WorkflowEngineAndSpecification } from './WorkflowEngineAndSpecification';
import { WorkflowEngineNotSpecification } from './WorkflowEngineNotSpecification';

export class WorkflowEngineOrSpecification implements IWorkflowEngineSpecification {
  private _specs: IWorkflowEngineSpecification[];

  constructor(specs: IWorkflowEngineSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IWorkflowEngineSpecification): IWorkflowEngineSpecification {
    return new WorkflowEngineAndSpecification([this, other]);
  }

  or(other: IWorkflowEngineSpecification): IWorkflowEngineSpecification {
    return new WorkflowEngineOrSpecification([...this._specs, other]);
  }

  not(): IWorkflowEngineSpecification {
    return new WorkflowEngineNotSpecification(this);
  }

  getSpecifications(): IWorkflowEngineSpecification[] {
    return [...this._specs];
  }
}
