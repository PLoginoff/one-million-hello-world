/**
 * BackupNotSpecification
 */

import { IBackupSpecification } from './IBackupSpecification';
import { BackupAndSpecification } from './BackupAndSpecification';
import { BackupOrSpecification } from './BackupOrSpecification';

export class BackupNotSpecification implements IBackupSpecification {
  private _spec: IBackupSpecification;

  constructor(spec: IBackupSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IBackupSpecification): IBackupSpecification {
    return new BackupAndSpecification([this, other]);
  }

  or(other: IBackupSpecification): IBackupSpecification {
    return new BackupOrSpecification([this, other]);
  }

  not(): IBackupSpecification {
    return this._spec;
  }

  getInner(): IBackupSpecification {
    return this._spec;
  }
}
