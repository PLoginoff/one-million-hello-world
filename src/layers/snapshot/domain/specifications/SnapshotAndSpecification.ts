/**
 * SnapshotAndSpecification
 */

import { ISnapshotSpecification } from './ISnapshotSpecification';
import { SnapshotOrSpecification } from './SnapshotOrSpecification';
import { SnapshotNotSpecification } from './SnapshotNotSpecification';

export class SnapshotAndSpecification implements ISnapshotSpecification {
  private _specs: ISnapshotSpecification[];

  constructor(specs: ISnapshotSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISnapshotSpecification): ISnapshotSpecification {
    return new SnapshotAndSpecification([...this._specs, other]);
  }

  or(other: ISnapshotSpecification): ISnapshotSpecification {
    return new SnapshotOrSpecification([this, other]);
  }

  not(): ISnapshotSpecification {
    return new SnapshotNotSpecification(this);
  }

  getSpecifications(): ISnapshotSpecification[] {
    return [...this._specs];
  }
}
