/**
 * SecurityAndSpecification
 */

import { ISecuritySpecification } from './ISecuritySpecification';
import { SecurityOrSpecification } from './SecurityOrSpecification';
import { SecurityNotSpecification } from './SecurityNotSpecification';

export class SecurityAndSpecification implements ISecuritySpecification {
  private _specs: ISecuritySpecification[];

  constructor(specs: ISecuritySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISecuritySpecification): ISecuritySpecification {
    return new SecurityAndSpecification([...this._specs, other]);
  }

  or(other: ISecuritySpecification): ISecuritySpecification {
    return new SecurityOrSpecification([this, other]);
  }

  not(): ISecuritySpecification {
    return new SecurityNotSpecification(this);
  }

  getSpecifications(): ISecuritySpecification[] {
    return [...this._specs];
  }
}
