/**
 * GitopsNotSpecification
 */

import { IGitopsSpecification } from './IGitopsSpecification';
import { GitopsAndSpecification } from './GitopsAndSpecification';
import { GitopsOrSpecification } from './GitopsOrSpecification';

export class GitopsNotSpecification implements IGitopsSpecification {
  private _spec: IGitopsSpecification;

  constructor(spec: IGitopsSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IGitopsSpecification): IGitopsSpecification {
    return new GitopsAndSpecification([this, other]);
  }

  or(other: IGitopsSpecification): IGitopsSpecification {
    return new GitopsOrSpecification([this, other]);
  }

  not(): IGitopsSpecification {
    return this._spec;
  }

  getInner(): IGitopsSpecification {
    return this._spec;
  }
}
