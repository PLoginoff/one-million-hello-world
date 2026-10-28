/**
 * WorkflowEngineAndSpecification
 */

import { IWorkflowEngineSpecification } from './IWorkflowEngineSpecification';
import { WorkflowEngineOrSpecification } from './WorkflowEngineOrSpecification';
import { WorkflowEngineNotSpecification } from './WorkflowEngineNotSpecification';

export class WorkflowEngineAndSpecification implements IWorkflowEngineSpecification {
  private _specs: IWorkflowEngineSpecification[];

  constructor(specs: IWorkflowEngineSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IWorkflowEngineSpecification): IWorkflowEngineSpecification {
    return new WorkflowEngineAndSpecification([...this._specs, other]);
  }

  or(other: IWorkflowEngineSpecification): IWorkflowEngineSpecification {
    return new WorkflowEngineOrSpecification([this, other]);
  }

  not(): IWorkflowEngineSpecification {
    return new WorkflowEngineNotSpecification(this);
  }

  getSpecifications(): IWorkflowEngineSpecification[] {
    return [...this._specs];
  }
}
