/**
 * BackupOrSpecification
 */

import { IBackupSpecification } from './IBackupSpecification';
import { BackupAndSpecification } from './BackupAndSpecification';
import { BackupNotSpecification } from './BackupNotSpecification';

export class BackupOrSpecification implements IBackupSpecification {
  private _specs: IBackupSpecification[];

  constructor(specs: IBackupSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IBackupSpecification): IBackupSpecification {
    return new BackupAndSpecification([this, other]);
  }

  or(other: IBackupSpecification): IBackupSpecification {
    return new BackupOrSpecification([...this._specs, other]);
  }

  not(): IBackupSpecification {
    return new BackupNotSpecification(this);
  }

  getSpecifications(): IBackupSpecification[] {
    return [...this._specs];
  }
}
