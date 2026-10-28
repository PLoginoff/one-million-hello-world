/**
 * SecurityOrSpecification
 */

import { ISecuritySpecification } from './ISecuritySpecification';
import { SecurityAndSpecification } from './SecurityAndSpecification';
import { SecurityNotSpecification } from './SecurityNotSpecification';

export class SecurityOrSpecification implements ISecuritySpecification {
  private _specs: ISecuritySpecification[];

  constructor(specs: ISecuritySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISecuritySpecification): ISecuritySpecification {
    return new SecurityAndSpecification([this, other]);
  }

  or(other: ISecuritySpecification): ISecuritySpecification {
    return new SecurityOrSpecification([...this._specs, other]);
  }

  not(): ISecuritySpecification {
    return new SecurityNotSpecification(this);
  }

  getSpecifications(): ISecuritySpecification[] {
    return [...this._specs];
  }
}
