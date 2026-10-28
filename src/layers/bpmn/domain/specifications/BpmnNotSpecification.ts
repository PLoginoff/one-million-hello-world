/**
 * BpmnNotSpecification
 */

import { IBpmnSpecification } from './IBpmnSpecification';
import { BpmnAndSpecification } from './BpmnAndSpecification';
import { BpmnOrSpecification } from './BpmnOrSpecification';

export class BpmnNotSpecification implements IBpmnSpecification {
  private _spec: IBpmnSpecification;

  constructor(spec: IBpmnSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IBpmnSpecification): IBpmnSpecification {
    return new BpmnAndSpecification([this, other]);
  }

  or(other: IBpmnSpecification): IBpmnSpecification {
    return new BpmnOrSpecification([this, other]);
  }

  not(): IBpmnSpecification {
    return this._spec;
  }

  getInner(): IBpmnSpecification {
    return this._spec;
  }
}
