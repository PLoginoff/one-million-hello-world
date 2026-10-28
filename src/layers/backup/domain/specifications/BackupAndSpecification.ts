/**
 * BackupAndSpecification
 */

import { IBackupSpecification } from './IBackupSpecification';
import { BackupOrSpecification } from './BackupOrSpecification';
import { BackupNotSpecification } from './BackupNotSpecification';

export class BackupAndSpecification implements IBackupSpecification {
  private _specs: IBackupSpecification[];

  constructor(specs: IBackupSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBackupSpecification): IBackupSpecification {
    return new BackupAndSpecification([...this._specs, other]);
  }

  or(other: IBackupSpecification): IBackupSpecification {
    return new BackupOrSpecification([this, other]);
  }

  not(): IBackupSpecification {
    return new BackupNotSpecification(this);
  }

  getSpecifications(): IBackupSpecification[] {
    return [...this._specs];
  }
}
