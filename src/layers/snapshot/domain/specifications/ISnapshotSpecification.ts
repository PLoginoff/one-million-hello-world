/**
 * ISnapshotSpecification interface
 */

export interface ISnapshotSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISnapshotSpecification): ISnapshotSpecification;
  or(other: ISnapshotSpecification): ISnapshotSpecification;
  not(): ISnapshotSpecification;
}
