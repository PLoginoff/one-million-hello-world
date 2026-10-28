/**
 * GitopsAndSpecification
 */

import { IGitopsSpecification } from './IGitopsSpecification';
import { GitopsOrSpecification } from './GitopsOrSpecification';
import { GitopsNotSpecification } from './GitopsNotSpecification';

export class GitopsAndSpecification implements IGitopsSpecification {
  private _specs: IGitopsSpecification[];

  constructor(specs: IGitopsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IGitopsSpecification): IGitopsSpecification {
    return new GitopsAndSpecification([...this._specs, other]);
  }

  or(other: IGitopsSpecification): IGitopsSpecification {
    return new GitopsOrSpecification([this, other]);
  }

  not(): IGitopsSpecification {
    return new GitopsNotSpecification(this);
  }

  getSpecifications(): IGitopsSpecification[] {
    return [...this._specs];
  }
}
