/**
 * SecurityNotSpecification
 */

import { ISecuritySpecification } from './ISecuritySpecification';
import { SecurityAndSpecification } from './SecurityAndSpecification';
import { SecurityOrSpecification } from './SecurityOrSpecification';

export class SecurityNotSpecification implements ISecuritySpecification {
  private _spec: ISecuritySpecification;

  constructor(spec: ISecuritySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISecuritySpecification): ISecuritySpecification {
    return new SecurityAndSpecification([this, other]);
  }

  or(other: ISecuritySpecification): ISecuritySpecification {
    return new SecurityOrSpecification([this, other]);
  }

  not(): ISecuritySpecification {
    return this._spec;
  }

  getInner(): ISecuritySpecification {
    return this._spec;
  }
}
