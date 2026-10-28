/**
 * SnapshotOrSpecification
 */

import { ISnapshotSpecification } from './ISnapshotSpecification';
import { SnapshotAndSpecification } from './SnapshotAndSpecification';
import { SnapshotNotSpecification } from './SnapshotNotSpecification';

export class SnapshotOrSpecification implements ISnapshotSpecification {
  private _specs: ISnapshotSpecification[];

  constructor(specs: ISnapshotSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISnapshotSpecification): ISnapshotSpecification {
    return new SnapshotAndSpecification([this, other]);
  }

  or(other: ISnapshotSpecification): ISnapshotSpecification {
    return new SnapshotOrSpecification([...this._specs, other]);
  }

  not(): ISnapshotSpecification {
    return new SnapshotNotSpecification(this);
  }

  getSpecifications(): ISnapshotSpecification[] {
    return [...this._specs];
  }
}
