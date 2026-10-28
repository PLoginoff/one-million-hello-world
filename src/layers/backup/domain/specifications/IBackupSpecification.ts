/**
 * IBackupSpecification interface
 */

export interface IBackupSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IBackupSpecification): IBackupSpecification;
  or(other: IBackupSpecification): IBackupSpecification;
  not(): IBackupSpecification;
}
