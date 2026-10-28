/**
 * SnapshotNotSpecification
 */

import { ISnapshotSpecification } from './ISnapshotSpecification';
import { SnapshotAndSpecification } from './SnapshotAndSpecification';
import { SnapshotOrSpecification } from './SnapshotOrSpecification';

export class SnapshotNotSpecification implements ISnapshotSpecification {
  private _spec: ISnapshotSpecification;

  constructor(spec: ISnapshotSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISnapshotSpecification): ISnapshotSpecification {
    return new SnapshotAndSpecification([this, other]);
  }

  or(other: ISnapshotSpecification): ISnapshotSpecification {
    return new SnapshotOrSpecification([this, other]);
  }

  not(): ISnapshotSpecification {
    return this._spec;
  }

  getInner(): ISnapshotSpecification {
    return this._spec;
  }
}
