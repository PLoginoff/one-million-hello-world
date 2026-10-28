/**
 * GitopsOrSpecification
 */

import { IGitopsSpecification } from './IGitopsSpecification';
import { GitopsAndSpecification } from './GitopsAndSpecification';
import { GitopsNotSpecification } from './GitopsNotSpecification';

export class GitopsOrSpecification implements IGitopsSpecification {
  private _specs: IGitopsSpecification[];

  constructor(specs: IGitopsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IGitopsSpecification): IGitopsSpecification {
    return new GitopsAndSpecification([this, other]);
  }

  or(other: IGitopsSpecification): IGitopsSpecification {
    return new GitopsOrSpecification([...this._specs, other]);
  }

  not(): IGitopsSpecification {
    return new GitopsNotSpecification(this);
  }

  getSpecifications(): IGitopsSpecification[] {
    return [...this._specs];
  }
}
